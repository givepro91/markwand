#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const electronPath = require('electron')
const viewportCases = [
  { width: 1400, height: 900 },
  { width: 1440, height: 900 },
  { width: 1600, height: 900 },
]

function makeProjectId(root) {
  return createHash('sha1').update(root).digest('hex').slice(0, 16)
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (!address || typeof address === 'string') reject(new Error('Failed to allocate a debug port'))
        else resolve(address.port)
      })
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForTarget(port, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (res.ok) {
        const targets = await res.json()
        const target = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
        if (target) return target
      }
    } catch (err) {
      lastError = err
    }
    await delay(250)
  }
  throw new Error(`Timed out waiting for Electron CDP target${lastError ? `: ${lastError.message}` : ''}`)
}

class CdpClient {
  constructor(ws) {
    this.ws = ws
    this.nextId = 1
    this.pending = new Map()
    ws.addEventListener('message', (event) => {
      const raw = typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8')
      const msg = JSON.parse(raw)
      if (!msg.id) return
      const request = this.pending.get(msg.id)
      if (!request) return
      this.pending.delete(msg.id)
      if (msg.error) request.reject(new Error(`${msg.error.message}: ${msg.error.data ?? ''}`))
      else request.resolve(msg.result)
    })
    ws.addEventListener('close', () => {
      for (const request of this.pending.values()) {
        request.reject(new Error('CDP socket closed'))
      }
      this.pending.clear()
    })
  }

  static async connect(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', () => reject(new Error('Failed to open CDP socket')), { once: true })
    })
    return new CdpClient(ws)
  }

  send(method, params = {}) {
    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params })
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(payload)
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
      throw new Error(text)
    }
    return result.result.value
  }

  close() {
    this.ws.close()
  }
}

async function waitForExpression(client, expression, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await client.evaluate(expression)
    if (value) return value
    await delay(250)
  }
  throw new Error(`Timed out waiting for expression: ${expression.slice(0, 120)}`)
}

async function prepareFixture() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'markwand-layout-smoke-'))
  const userData = path.join(tempRoot, 'userData')
  const projectRoot = path.join(tempRoot, 'layout-project')
  const workspaceId = randomUUID()
  const projectId = makeProjectId(projectRoot)
  const docPath = path.join(projectRoot, 'prd-and-strategy-collaboration.md')
  await fs.mkdir(userData, { recursive: true })
  await fs.mkdir(projectRoot, { recursive: true })
  await fs.writeFile(path.join(projectRoot, 'CLAUDE.md'), '# Layout Smoke\n')
  await fs.writeFile(
    docPath,
    [
      '# PRD.전략 문서 협업 규칙',
      '',
      '본 규칙은 1440px 근처에서 목차 패널을 켜도 본문과 스티키 헤더가 깨지지 않는지 확인하기 위한 fixture입니다.',
      '',
      '> [!IMPORTANT]',
      '> 현재 액션: 콜아웃이 일반 인용으로 눌리지 않고 눈에 띄어야 합니다.',
      '>',
      '> - [x] GFM Alert 렌더 확인',
      '> - [ ] 다음 AO 선택',
      '',
      '<details open>',
      '<summary>검증 메모</summary>',
      '',
      '- 접힘 영역 안에서도 **마크다운 본문**이 유지되어야 합니다.',
      '',
      '</details>',
      '',
      '## 1. 시장·커뮤니티 신호는 직접 조사한다',
      '',
      '- WebSearch / WebFetch / general-purpose Agent를 병렬로 띄워 먼저 조사한다.',
      '- 출처와 함께 구체 신호를 합성해서 가져온다.',
      '- 결정 질문은 옵션이 들어있는 질문으로 한다.',
      '',
      '## 2. 가상 회사명·인물명을 박지 않는다',
      '',
      '페르소나·시나리오를 적을 때 만들어낸 이름을 쓰지 않는다.',
      '',
      '## 3. 페르소나에 사용자 카테고리 편견을 넣지 않는다',
      '',
      '사용자 카테고리를 섣불리 고정하지 않는다.',
      '',
      '## 4. 임의 기간 milestone을 박지 않는다',
      '',
      '검증 전에는 일정 단위를 확정하지 않는다.',
      '',
      '## 적용 대상',
      '',
      '| 폴더 | 의미 | 예시 |',
      '| --- | --- | --- |',
      '| docs/projects/plans/ | 활성 작업 | M1 Plan, M2 Plan |',
      '| docs/areas/operations/ | 지속 운영 | weekly-review.md |',
      '| docs/specs/very-long-path-name/with/many/segments/state-review.md | 길이가 긴 상태 문서 경로 | `config/ownership.local.yaml` · `scripts/release-preview.sh` |',
      '',
      '## 밀도 높은 매트릭스',
      '',
      '| A | B | C | D | E | F |',
      '| --- | --- | --- | --- | --- | --- |',
      '| alpha-state-dashboard-phase-one | beta-status-dashboard-phase-two | gamma-visual-intent-verify-sprint | delta-cross-harness-verification | epsilon-init-roadmap-heuristic | zeta-render-state-artifact |',
      '',
      '## 부록',
      '',
      '이 문서는 자동 레이아웃 검증 전용입니다.',
      '',
    ].join('\n')
  )

  await fs.writeFile(
    path.join(userData, 'markwand.json'),
    JSON.stringify(
      {
        workspaces: [
          {
            id: workspaceId,
            name: 'Layout Smoke',
            root: projectRoot,
            mode: 'single',
            transport: { type: 'local' },
            addedAt: Date.now(),
            lastOpened: null,
          },
        ],
        activeWorkspaceId: workspaceId,
        activeProjectId: projectId,
        viewMode: 'project',
        theme: 'light',
        readDocs: {},
        treeExpanded: {},
        sortOrder: 'recent',
        terminal: 'Terminal',
        defaultProjectOpener: 'finder',
        sshKnownHosts: {},
        experimentalFeatures: { sshTransport: false },
        composerOnboardingSeen: true,
        onboardingShown: true,
        sidebarWidth: 260,
      },
      null,
      2
    )
  )

  return { tempRoot, userData, projectRoot, docPath }
}

function jsString(value) {
  return JSON.stringify(value)
}

async function openFixtureDoc(client, docName) {
  await waitForExpression(client, 'document.readyState === "complete" || document.readyState === "interactive"')
  await waitForExpression(
    client,
    `Array.from(document.querySelectorAll('span[title]')).some((el) => el.getAttribute('title') === ${jsString(docName)})`,
    30_000
  )
  await client.evaluate(`
    (() => {
      const docName = ${jsString(docName)};
      const label = Array.from(document.querySelectorAll('span[title]'))
        .find((el) => el.getAttribute('title') === docName);
      if (!label) return false;
      const target = label.closest('[role="treeitem"]') || label.parentElement || label;
      label.scrollIntoView({ block: 'center', inline: 'nearest' });
      target.click();
      return true;
    })()
  `)
  await waitForExpression(
    client,
    `!!document.querySelector('[data-project-doc-return-bar]') && (document.body.textContent || '').includes('PRD.전략 문서 협업 규칙')`,
    20_000
  )
  await client.evaluate(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('[data-project-doc-actions] button, button'));
      const target = buttons.find((button) => {
        const text = (button.textContent || '').trim();
        const label = button.getAttribute('aria-label') || '';
        return text.includes('목차') || label.includes('목차') || text.toLowerCase().includes('toc') || label.toLowerCase().includes('toc');
      });
      if (!target) return false;
      target.click();
      return true;
    })()
  `)
  await waitForExpression(client, '!!document.querySelector("aside[aria-label]")', 10_000)
}

async function measureLayout(client, width, height) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await delay(350)
  return client.evaluate(`
    (() => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
          left: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      };
      const scroll = document.querySelector('[data-project-scroll-container]');
      const bar = document.querySelector('[data-project-doc-return-bar]');
      const actions = document.querySelector('[data-project-doc-actions]');
      const body = document.querySelector('[data-project-document-body]');
      const markdown = document.querySelector('.markdown-viewer');
      const aside = document.querySelector('aside[aria-label]');
      const alert = document.querySelector('.markdown-alert');
      const details = document.querySelector('.markdown-safe-details');
      const tables = Array.from(document.querySelectorAll('.markdown-table-scroll'));
      const fitTable = tables[0] ?? null;
      const denseTable = tables.at(-1) ?? null;
      const fitTableContent = fitTable?.querySelector('table') ?? null;
      const denseTableContent = denseTable?.querySelector('table') ?? null;
      const scrollRect = rect(scroll);
      const barRect = rect(bar);
      const bodyRect = rect(body);
      const asideRect = rect(aside);
      const styles = (el) => el ? getComputedStyle(el) : null;
      const scrollStyle = styles(scroll);
      const barStyle = styles(bar);
      const bodyStyle = styles(body);
      const asideStyle = styles(aside);
      return {
        innerWidth,
        innerHeight,
        hasBar: !!bar,
        hasActions: !!actions,
        hasBody: !!body,
        hasMarkdown: !!markdown,
        hasAside: !!aside,
        hasAlert: !!alert,
        hasSafeDetails: !!details,
        rawAlertMarkerVisible: (markdown?.textContent || '').includes('[!IMPORTANT]'),
        titleText: (document.querySelector('.markdown-viewer h1')?.textContent || '').trim(),
        scroll: scrollRect,
        bar: barRect,
        actions: rect(actions),
        body: bodyRect,
        markdown: rect(markdown),
        aside: asideRect,
        alert: rect(alert),
        details: rect(details),
        fitTable: rect(fitTable),
        fitTableClientWidth: fitTable ? Math.round(fitTable.clientWidth) : null,
        fitTableScrollWidth: fitTable ? Math.round(fitTable.scrollWidth) : null,
        fitTableContentWidth: fitTableContent ? Math.round(fitTableContent.getBoundingClientRect().width) : null,
        denseTable: rect(denseTable),
        denseTableClientWidth: denseTable ? Math.round(denseTable.clientWidth) : null,
        denseTableScrollWidth: denseTable ? Math.round(denseTable.scrollWidth) : null,
        denseTableContentWidth: denseTableContent ? Math.round(denseTableContent.getBoundingClientRect().width) : null,
        scrollPaddingTop: scrollStyle?.paddingTop ?? null,
        scrollPaddingLeft: scrollStyle?.paddingLeft ?? null,
        scrollOverflowY: scrollStyle?.overflowY ?? null,
        barFlexWrap: barStyle?.flexWrap ?? null,
        bodyPaddingTop: bodyStyle?.paddingTop ?? null,
        bodyPaddingLeft: bodyStyle?.paddingLeft ?? null,
        asidePaddingLeft: asideStyle?.paddingLeft ?? null,
        asidePaddingRight: asideStyle?.paddingRight ?? null,
        stickyGap: scrollRect && barRect ? barRect.top - scrollRect.top : null,
        bodyGapAfterBar: barRect && bodyRect ? bodyRect.top - barRect.bottom : null,
        bodyOverlapsBar: barRect && bodyRect ? bodyRect.top < barRect.bottom - 1 : null,
      };
    })()
  `)
}

function assertLayout(measurement, width) {
  const failures = []
  if (!measurement.hasBar) failures.push('document return bar was not rendered')
  if (!measurement.hasActions) failures.push('document actions were not rendered')
  if (!measurement.hasBody) failures.push('document body wrapper was not rendered')
  if (!measurement.hasMarkdown) failures.push('markdown viewer was not rendered')
  if (!measurement.hasAside) failures.push('TOC rail was not rendered')
  if (!measurement.hasAlert) failures.push('GFM alert callout was not rendered')
  if (!measurement.hasSafeDetails) failures.push('safe details block was not rendered')
  if (measurement.rawAlertMarkerVisible) failures.push('raw GFM alert marker is still visible')
  if (measurement.titleText !== 'PRD.전략 문서 협업 규칙') failures.push(`unexpected h1: ${measurement.titleText}`)
  if (measurement.scrollPaddingTop !== '0px') failures.push(`scroll container top padding is ${measurement.scrollPaddingTop}`)
  if (measurement.bodyPaddingTop !== '0px') failures.push(`document body top padding is ${measurement.bodyPaddingTop}`)
  if (Math.abs(measurement.stickyGap ?? 999) > 1) failures.push(`sticky bar gap is ${measurement.stickyGap}px`)
  if ((measurement.bodyGapAfterBar ?? -999) < 12) failures.push(`body starts too close to sticky bar: ${measurement.bodyGapAfterBar}px`)
  if (measurement.bodyOverlapsBar) failures.push('document body overlaps sticky bar')
  if ((measurement.aside?.width ?? 9999) > 285) failures.push(`TOC rail is too wide: ${measurement.aside?.width}px`)
  if ((measurement.aside?.width ?? 0) < 215) failures.push(`TOC rail is too narrow: ${measurement.aside?.width}px`)
  if ((measurement.scroll?.width ?? 0) < 840) failures.push(`center document pane is too narrow at ${width}px: ${measurement.scroll?.width}px`)
  if ((measurement.bar?.height ?? 999) > 68) failures.push(`sticky bar wrapped too tall: ${measurement.bar?.height}px`)
  if ((measurement.actions?.height ?? 999) > 44) failures.push(`action row wrapped too tall: ${measurement.actions?.height}px`)
  if ((measurement.markdown?.width ?? 0) < 760) failures.push(`markdown reading width is too narrow: ${measurement.markdown?.width}px`)
  if (!measurement.fitTable) failures.push('typical fixture table was not rendered')
  if ((measurement.fitTableScrollWidth ?? 9999) > (measurement.fitTableClientWidth ?? 0) + 1) {
    failures.push('typical 3-column table unexpectedly requires horizontal scrolling')
  }
  if (!measurement.denseTable) failures.push('dense fixture table was not rendered')
  if ((measurement.denseTableScrollWidth ?? 0) <= (measurement.denseTableClientWidth ?? 0)) {
    failures.push('dense 6-column table does not expose horizontal overflow containment')
  }
  return failures
}

async function shutdown(child) {
  if (child.exitCode != null) return
  child.kill('SIGINT')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(3_000).then(() => {
      if (child.exitCode == null) child.kill('SIGKILL')
    }),
  ])
}

async function main() {
  if (!existsSync(path.join(repoRoot, 'out/main/index.js'))) {
    throw new Error('Electron output is missing. Run `pnpm build` before layout smoke.')
  }

  const { tempRoot, userData } = await prepareFixture()
  const port = await freePort()
  const stderr = []
  const child = spawn(electronPath, [`--remote-debugging-port=${port}`, repoRoot], {
    cwd: repoRoot,
    env: {
      ...process.env,
      MARKWAND_USER_DATA_DIR: userData,
      MARKWAND_DISABLE_UPDATE_CHECK: '1',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  child.stderr.on('data', (chunk) => {
    stderr.push(chunk.toString('utf8'))
  })

  let client
  try {
    const target = await waitForTarget(port)
    client = await CdpClient.connect(target.webSocketDebuggerUrl)
    await client.send('Runtime.enable')
    await client.send('Page.enable')
    await openFixtureDoc(client, 'prd-and-strategy-collaboration.md')

    const measurements = []
    const failures = []
    for (const item of viewportCases) {
      const measurement = await measureLayout(client, item.width, item.height)
      measurements.push(measurement)
      const caseFailures = assertLayout(measurement, item.width)
      if (caseFailures.length > 0) {
        failures.push({ viewport: `${item.width}x${item.height}`, failures: caseFailures, measurement })
      }
    }

    if (failures.length > 0) {
      console.error(JSON.stringify({ status: 'failed', failures, stderr: stderr.join('').slice(-4000) }, null, 2))
      process.exitCode = 1
      return
    }

    console.log(JSON.stringify({ status: 'passed', measurements }, null, 2))
  } finally {
    client?.close()
    await shutdown(child)
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
