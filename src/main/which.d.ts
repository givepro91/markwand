declare module 'which' {
  function which(cmd: string, options?: { nothrow?: boolean; path?: string }): Promise<string>
  export = which
}
