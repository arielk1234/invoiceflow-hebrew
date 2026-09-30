/**
 * Maps error codes raised by the server (Postgres functions, server functions
 * and the Israel Invoice integration) to Hebrew messages for the user.
 *
 * Order matters: more specific codes must come before codes they contain.
 */
const MESSAGES: Array<[code: string, message: string]> = [
  ["ALLOCATION_NUMBER_REQUIRED", "נדרש מספר הקצאה לפני הפקת החשבונית"],
  ["ISSUE_DATE_IN_FUTURE", "אי אפשר להפיק מסמך בתאריך עתידי"],
  ["CREDIT_REASON_REQUIRED", "יש לציין את סיבת הזיכוי"],
  ["DRAFT_IS_NOT_A_DOCUMENT", "טיוטה אינה מסמך. אפשר להדפיס אותה רק כטיוטה."],
  ["CHEQUE_DETAILS_REQUIRED", "בתשלום בהמחאה יש למלא מספר בנק, סניף, חשבון ומספר המחאה"],
  ["DRAFT_REPORTED_TO_TAX_AUTHORITY", "מספר הטיוטה כבר נשלח לרשות המסים, ולכן אי אפשר למחוק אותה"],
  ["DRAFT_MUST_BE_DELETED_NOT_CANCELLED", "טיוטה לא מבטלים, אפשר למחוק אותה"],
  ["ISSUED_DOCUMENT_ITEMS_IMMUTABLE", "המסמך כבר הופק ולא ניתן לשנות את שורות החיוב שלו"],
  ["ISSUED_DOCUMENT_IMMUTABLE", "המסמך כבר הופק ולא ניתן לשנות אותו"],
  ["DOCUMENT_LOCKED", "המסמך כבר הופק ולא ניתן לשנות אותו"],
  [
    "ALLOCATION_REQUEST_AMBIGUOUS_RETRY_BLOCKED",
    "בקשה קודמת למספר הקצאה לחשבונית זו לא הסתיימה, ולא ידוע אם אושרה. כדי למנוע כפילות לא נשלחה בקשה נוספת. יש לבדוק את מצב הבקשה מול רשות המסים.",
  ],
  [
    "ALLOCATION_NOT_APPROVED_462",
    "רשות המסים לא אישרה את החשבונית, וכבר נשלחה לרשות החלטה לגביה. אין צורך בפעולה נוספת מול הרשות.",
  ],
  [
    "ALLOCATION_NOT_APPROVED",
    "רשות המסים לא אישרה מספר הקצאה לחשבונית זו והיא עוכבה. צריך לבחור איך להמשיך בעמוד החשבונית.",
  ],
  [
    "ALLOCATION_DECISION_REJECTED_463",
    "רשות המסים לא מצאה חשבונית מעוכבת עם הפרטים האלה, ולכן לא קיבלה את ההחלטה",
  ],
  ["ALLOCATION_DECISION_REJECTED", "רשות המסים לא קיבלה את ההחלטה"],
  ["ALLOCATION_DECISION_ALREADY_SENT", "כבר נשלחה לרשות המסים החלטה לגבי חשבונית זו"],
  ["ALLOCATION_DECISION_NOT_APPLICABLE", "אפשר לשלוח החלטה רק על חשבונית שרשות המסים עיכבה"],
  ["ALLOCATION_REQUEST_INVALID_431", "רשות המסים דיווחה שמספר העוסק בחשבונית שגוי"],
  ["ALLOCATION_REQUEST_INVALID_434", "תאריך החשבונית ישן מדי לבקשת מספר הקצאה"],
  ["ALLOCATION_REQUEST_INVALID", "רשות המסים דחתה את הבקשה בגלל נתונים שגויים בחשבונית"],
  [
    "ALLOCATION_API_FORBIDDEN",
    "למשתמש שחובר לרשות המסים אין הרשאה לבקש מספרי הקצאה עבור מספר העוסק של העסק",
  ],
  ["ALLOCATION_API_NETWORK_ERROR", "אין תקשורת עם רשות המסים. כדאי לנסות שוב בעוד כמה דקות."],
  ["ALLOCATION_API_ERROR", "רשות המסים החזירה שגיאה בבקשת מספר ההקצאה. כדאי לנסות שוב מאוחר יותר."],
  [
    "ISRAEL_INVOICE_OAUTH_NOT_CONNECTED",
    "העסק עדיין לא מחובר לרשות המסים. אפשר להתחבר בעמוד הגדרות העסק.",
  ],
  [
    "ISRAEL_INVOICE_OAUTH_UNAUTHORIZED",
    "רשות המסים לא אישרה את החיבור הקיים. יש להתחבר מחדש בעמוד הגדרות העסק.",
  ],
  [
    "INVALID_SOFTWARE_REGISTRATION_NUMBER",
    "מספר רישום התוכנה ברשות המסים צריך להיות בן 8 או 9 ספרות. יש לבדוק את הגדרות השרת.",
  ],
  [
    "INVALID_INVOICE_REFERENCE_NUMBER",
    "מספר המסמך ארוך מ-20 תווים ולכן אי אפשר לבקש עבורו מספר הקצאה. כדאי לקצר את קידומת המספור.",
  ],
  [
    "ISRAEL_INVOICE_REFRESH_TOKEN_MISSING",
    "פג תוקף החיבור לרשות המסים. יש להתחבר מחדש בעמוד הגדרות העסק.",
  ],
  [
    "ISRAEL_INVOICE_OAUTH_REFRESH_ERROR",
    "פג תוקף החיבור לרשות המסים. יש להתחבר מחדש בעמוד הגדרות העסק.",
  ],
  [
    "INVALID_VAT_NUMBER_FOR_ALLOCATION",
    "לבקשת מספר הקצאה נדרש מספר עוסק תקין בן 9 ספרות, גם בפרטי העסק וגם בפרטי הלקוח. כדאי לבדוק שאין טעות הקלדה.",
  ],
  ["INVALID_CUSTOMER_VAT_NUMBER", "מספר העוסק של הלקוח חייב להיות בן 9 ספרות"],
  ["INVALID_ISSUER_VAT_NUMBER", "מספר העוסק של העסק חייב להיות בן 9 ספרות"],
  [
    "EXEMPT_BUSINESS_CANNOT_ISSUE_TAX_INVOICE",
    "עוסק פטור אינו יכול להפיק חשבונית מס או חשבונית זיכוי",
  ],
  ["CREDIT_NOTE_REQUIRES_RELATED_DOCUMENT", "חשבונית זיכוי חייבת להיות מקושרת למסמך המקורי"],
  ["DOCUMENT_TOTAL_MUST_BE_POSITIVE", "סכום המסמך חייב להיות גדול מאפס"],
  ["INVALID_VAT_RATE", "שיעור המע״מ אינו תקין"],
  ["DOCUMENT_NOT_DRAFT", "המסמך כבר הופק ולא ניתן לשנות אותו"],
  ["ISSUED_DOCUMENT_CANNOT_BE_DELETED", "לא ניתן למחוק מסמך שהופק. אפשר לבטל אותו."],
  ["DOCUMENT_PREFIX_LOCKED_AFTER_ISSUANCE", "אי אפשר לשנות את קידומת המספור אחרי שהופקו מסמכים"],
  ["CLIENT_NOT_FOUND", "הלקוח של המסמך לא נמצא"],
  ["DOCUMENT_NOT_FOUND", "המסמך לא נמצא"],
  ["INVALID_STATUS_TRANSITION", "לא ניתן לשנות את הסטטוס בצורה הזו"],
  ["AUTH_SESSION_REQUIRED", "פג תוקף ההתחברות. יש להתחבר מחדש."],
  ["AUTH_REQUIRED", "פג תוקף ההתחברות. יש להתחבר מחדש."],
  ["FORBIDDEN", "אין לך הרשאה לפעולה זו"],
  [
    "MISSING_ENV_",
    "חסרות הגדרות שרת לחיבור לרשות המסים. יש להגדיר אותן ב-Lovable לפי docs/ISRAEL_INVOICE_API_ENV.md.",
  ],
  [
    "ISRAEL_INVOICE_TOKEN_ENCRYPTION_KEY",
    "מפתח ההצפנה לחיבור לרשות המסים אינו תקין. יש לבדוק את הגדרות השרת.",
  ],
  [
    "SUPABASE_SERVER_CONFIGURATION_MISSING",
    "חסרות הגדרות שרת. יש לבדוק את הגדרות Supabase ב-Lovable.",
  ],
  // PostgREST: a table, column or function the code expects does not exist yet.
  [
    "in the schema cache",
    "מסד הנתונים עוד לא עודכן. צריך לבקש מ-Lovable להריץ את המיגרציות שבתיקייה supabase/migrations.",
  ],
];

function rawMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  // Supabase/PostgREST errors are plain objects with a message field.
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return typeof error === "string" ? error : "";
}

export function errorMessage(error: unknown, fallback: string): string {
  const raw = rawMessage(error);
  return MESSAGES.find(([code]) => raw.includes(code))?.[1] ?? fallback;
}

/** The Tax Authority held the invoice (460/461), so the user must choose how to continue. */
export function isHeldInvoiceError(error: unknown): boolean {
  return /ALLOCATION_NOT_APPROVED_46[01]/.test(rawMessage(error));
}
