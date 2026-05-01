#!/bin/zsh
set -euo pipefail

APP_IN_APPLICATIONS="/Applications/Markwand.app"
SCRIPT_DIR="${0:A:h}"
APP_IN_FOLDER="$SCRIPT_DIR/Markwand.app"

if [[ -d "$APP_IN_APPLICATIONS" ]]; then
  APP="$APP_IN_APPLICATIONS"
elif [[ -d "$APP_IN_FOLDER" ]]; then
  APP="$APP_IN_FOLDER"
else
  echo "Markwand.app을 찾지 못했습니다."
  echo "Markwand.app을 Applications 폴더로 옮긴 뒤 다시 실행해 주세요."
  read -r "?Enter를 누르면 닫습니다."
  exit 1
fi

echo "Markwand 첫 실행 준비 중..."
echo "대상: $APP"
/usr/bin/xattr -cr "$APP" 2>/dev/null || true
/usr/bin/open "$APP"
echo ""
echo "Markwand를 열었습니다. 이 창은 닫아도 됩니다."
sleep 2
