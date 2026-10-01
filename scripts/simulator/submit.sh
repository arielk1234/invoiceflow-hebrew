#!/bin/bash
# Uploads INI.TXT + BKMVDATA.TXT to the Tax Authority's public Uniform Format simulator
# and prints the summary and the detailed results. Works in a temporary folder.
# Only for files with fictitious details (scripts/simulator/gen-fixture.ts); the owner
# uploads files carrying their real details themselves.
# usage: scripts/simulator/submit.sh <folder with INI.TXT and BKMVDATA.TXT>
set -e
IN="$(cd "$1" && pwd)"
cd "$(mktemp -d)"
echo "work folder: $PWD"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
B="https://secapp.taxes.gov.il/TmbakmmsmlNew"
rm -f jar.txt
curl -s -A "$UA" -c jar.txt -b jar.txt -o form.html "$B/frmCheckFiles.aspx"
g(){ grep -a -o "id=\"$1\" value=\"[^\"]*\"" "$2" | sed 's/.*value="//; s/"$//'; }
text(){ iconv -f windows-1255 -t utf-8 "$1" | perl -0pe 's/<script\b.*?<\/script>//gs; s/<style\b.*?<\/style>//gs; s/<\/tr>/\n/g; s/<[^>]+>/ /g; s/&nbsp;/ /g; s/&#39;/'"'"'/g; s/[ \t]+/ /g; s/\n\s*\n+/\n/g'; }
P='ctl00$ContentUsersPage$UcUploadFiles1$'
curl -s -L -A "$UA" -c jar.txt -b jar.txt -e "$B/frmCheckFiles.aspx" -o summary.html \
  -F "__EVENTTARGET=" -F "__EVENTARGUMENT=" -F "__VIEWSTATE=$(g __VIEWSTATE form.html)" -F "__VIEWSTATEGENERATOR=$(g __VIEWSTATEGENERATOR form.html)" -F "__EVENTVALIDATION=$(g __EVENTVALIDATION form.html)" \
  -F 'ctl00$HFMasterErrMailDetails=' -F 'ctl00$TBMasterName=' -F 'ctl00$TBMasterTelephoneNumber=' -F 'ctl00$DDLMasterPhonePrefix=1' -F 'ctl00$TBMasterMail=' -F 'ctl00$TextAreaMasterMail=' \
  -F "${P}ddlEncoding=1" -F "${P}txtFile1=@$IN/INI.TXT;filename=INI.TXT;type=text/plain" -F "${P}txtFile2=@$IN/BKMVDATA.TXT;filename=BKMVDATA.TXT;type=text/plain" \
  -F "${P}btnCheck.x=24" -F "${P}btnCheck.y=12" -F 'ctl00$ContentUsersPage$hidFocus=' -F "ctl00\$HiddenSessionId=$(g HiddenSessionId form.html)" -F "ctl00\$HiddenPageName=$(g HiddenPageName form.html)" \
  "$B/frmCheckFiles.aspx"
text summary.html | tr '\n' ' ' | grep -o "דוח מסכם.*מספר קלט: [0-9]*"; echo
post(){ curl -s -L -A "$UA" -c jar.txt -b jar.txt -e "$2" -o "$4" --data-urlencode "__EVENTTARGET=$3" --data-urlencode '__EVENTARGUMENT=' \
  --data-urlencode "__VIEWSTATE=$(g __VIEWSTATE $1)" --data-urlencode "__VIEWSTATEGENERATOR=$(g __VIEWSTATEGENERATOR $1)" --data-urlencode "__EVENTVALIDATION=$(g __EVENTVALIDATION $1)" \
  --data-urlencode "ctl00\$HiddenSessionId=$(g HiddenSessionId $1)" --data-urlencode "ctl00\$HiddenPageName=$(g HiddenPageName $1)" "$2"; }
post summary.html "$B/frmDocSicum.aspx" 'ctl00$ContentUsersPage$lnkResult' results.html
text results.html | sed -n '/תוצאות בדיקת הקבצים/,/לבדיקת שלמות/p' | tr '\n' ' ' | sed 's/  */ /g'; echo
for t in lnkKlali lnkIni lnkBkmvdata; do post results.html "$B/frmShowResults.aspx" "ctl00\$ContentUsersPage\$$t" $t.html; echo "## $t:"; text $t.html | sed -n '/פירוט ליקויים/,/עמוד הבית/p' | sed '$d' | tr '\n' ' ' | sed 's/  */ /g' | cut -c1-600; echo; done
