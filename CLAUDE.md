# InvoiceFlow — כללי עבודה לצוות הפיתוח

@AGENTS.md

## המשתמש
- אריאל קלרמן, בעל העסק ויצרן התוכנה (מספר עוסק 206477515). הוא לא מפתח.
- **כל תקשורת איתו בעברית בלבד.** הסברים פשוטים, צעד אחר צעד, ובכל צעד בדיוק מה ללחוץ.
- כשצריך ממנו פעולה, אומרים לו מה בדיוק לעשות, ועושים בעצמנו כל מה שמותר.

## המערכת
- TanStack Start, React 19, Supabase. אירוח ב-Render לפי `render.yaml`: https://invoiceflow-hebrew.onrender.com
- מסד הנתונים כרגע ב-Lovable Cloud (Supabase). בתהליך מעבר לשרת Supabase עצמאי ב-Oracle Cloud ירושלים, כי לפי הוראה 25(א) להוראות ניהול פנקסים הנתונים חייבים להישמר בישראל.
- Lovable לא מושך קוד חדש כשאין בו קרדיטים, ולכן לא סומכים עליו לפריסה.
- מסמכי הרישום ברשות המסים: `docs/SOFTWARE_REGISTRATION.md` ו-`docs/submission/`. קבצי ההגשה עצמם ב-`submission-files/` (לא בגיט).

## מה הצוות לא עושה
- **לא מבצעים commit, push או merge.** המשתמש מעלה בעצמו מ-GitHub Desktop: Commit to main ← Push origin. אחרי ההעלאה מפעילים בנייה ידנית ב-Render (Manual Deploy ← Deploy latest commit), כי הבנייה האוטומטית לא פועלת.
- לא פותחים חשבונות, ולא מזינים סיסמאות, פרטי הזדהות או פרטי תשלום.
- לא מוחקים נתונים לצמיתות, גם לא בחשבון הבדיקה.
- לא שולחים לשירות חיצוני פרטים אמיתיים של המשתמש (מספר העוסק והשם שלו). לסימולטור שולחים רק קבצים מ-`scripts/simulator/gen-fixture.ts`, שהפרטים בהם בדיוניים.
- לא מריצים SQL על מסד הנתונים החי בלי אישור מפורש של המשתמש לכל הרצה.
- כשמנגנון הבטיחות חוסם פעולה, לא מנסים לעקוף אותו בדרך אחרת. מסבירים למשתמש ומבקשים שיעשה את זה בעצמו.

## רישום התוכנה
- אחרי הרישום, כל שינוי בתוכנה חוץ מעדכון סכומים הוא גרסה חדשה שמחייבת רישום חדש. שינוי במסד הנתונים או הוספת מודול מסמנים מראש ומודיעים למשתמש. מספר המהדורה: `VITE_UNIFORM_SOFTWARE_VERSION`.
- בשדה 1006 (מספר רישום התוכנה) נכתב 00000001 עד שתתקבל תעודת רישום.

## בדיקות לפני מסירה
- Node לא מותקן במערכת. אם `node` חסר, מורידים את Node 22 הרשמי לתיקייה זמנית ומוסיפים אותו ל-PATH.
- תמיד: `npx tsc --noEmit -p .`, ‏`npx prettier --write <files>`, ‏`npx eslint <files>`, ‏`npx tsx scripts/checks.ts`, ‏`npx vite build`.
- שינוי במיגרציות: `cd scripts/db-test && npm install --no-package-lock && node run.mjs --twice` צריך להסתיים ב-0 failure(s).
- שינוי במבנה האחיד: `npx tsx scripts/simulator/gen-fixture.ts <dir>` ואחר כך `scripts/simulator/submit.sh <dir>`. התוצאה חייבת להיות "תקינה".
- שינוי בממשק: בודקים בדפדפן עם התצורה `invoiceflow-dev` שב-`.claude/launch.json`.

## קוד
- מיגרציות חדשות: `supabase/migrations/<timestamp>_<name>.sql`, אידמפוטנטיות. את `src/integrations/supabase/types.ts` מעדכנים ידנית בהתאם.
- ב-`createFileRoute` משתמשים במחרוזת פשוטה. לא יוצרים `package-lock.json` בשורש (הפרויקט משתמש ב-bun.lock). `src/integrations` נוצר על ידי Lovable.
- הערות בקוד באנגלית, בסגנון הקוד הקיים. כל טקסט בממשק בעברית.
