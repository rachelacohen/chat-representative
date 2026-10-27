# Node + React

פרויקט קטן: שרת Express (Node) + לקוח React (Vite), עם רשימת משימות לדוגמה.

```
node-react-app/
├── server/            Express API (פורט 3001)
│   ├── src/index.js   ראוטים
│   ├── src/store.js   שכבת הנתונים היחידה + אודיט
│   ├── src/context.js זיהוי המשתמש (AsyncLocalStorage)
│   └── data/          db.json + audit.jsonl (נוצר אוטומטית, לא ב-git)
└── client/            React + Vite (פורט 5173, מעביר /api לשרת)
```

## הרצה

```bash
npm install
cp server/.env.example server/.env   # ולשנות את ADMIN_TOKEN
npm run dev                          # שרת + לקוח יחד
```

פתח http://localhost:5173

פרודקשן: `npm run build` ואז `npm start` — השרת מגיש גם את הלקוח הבנוי על http://localhost:3001.

## API

| Method | Path             | תיאור                         |
| ------ | ---------------- | ----------------------------- |
| GET    | /api/health      | בדיקת חיים                    |
| GET    | /api/tasks       | כל המשימות                    |
| POST   | /api/tasks       | `{ title }`                   |
| PATCH  | /api/tasks/:id   | `{ title?, done? }`           |
| DELETE | /api/tasks/:id   | מחיקה                         |
| GET    | /api/audit       | לוג אודיט (דורש `x-admin-token`) |

`/api/audit` מקבל `?entityType=Task&entityId=...&limit=100`.

## מדיניות אודיט לוג

כל שינוי נתונים (create / update / delete) נרשם ב-`server/data/audit.jsonl`.

- **מקור אמת אחד:** כל הכתיבות עוברות דרך `server/src/store.js`. אין גישה אחרת לקובץ הנתונים.
- **רק מודלים רשומים:** collection שלא מופיע ב-`AUDITED` נחסם בקריאה ובכתיבה.
- **רשומה:** `actorUserId`, `action`, `entityType`, `entityId`, `beforeJson`, `afterJson`, `createdAt`.
- **Actor:** בבקשת HTTP — מה-header `x-user-id` (או `anonymous`); מחוץ לבקשה (סקריפטים, רקע) — `system`.
  כרגע הלקוח שולח `demo-user` קבוע; כשיתווסף אימות אמיתי, יש לקחת את המשתמש מה-session במקום מה-header.
- **סינון סודות:** מפתחות שמתאימים ל-password / token / secret / apiKey / card / cvv נשמרים כ-`[REDACTED]`.
- **אין bulk:** ה-store חושף רק פעולות על רשומה בודדת.
- **כשל באודיט לא מפיל את הפעולה** — נרשם ל-console.
- **החרגה מכוונת:** לוג האודיט עצמו אינו מבוקר.
- **צפייה:** `GET /api/audit` עם `x-admin-token` שתואם ל-`ADMIN_TOKEN` ב-`server/.env`.

### Checklist לכל שינוי
1. collection חדש ⇒ נוסף ל-`AUDITED` ב-`store.js` עם שם entityType.
2. שדות רגישים ⇒ מכוסים ע"י `SECRET_KEY` (או להרחיב אותו).
3. אין כתיבה לקבצי `data/` שלא דרך `store.js`.
4. סקריפטים ⇒ מייבאים את `store.js` (יירשמו כ-`system`).
5. בדיקה בפועל: לבצע את הפעולה ולוודא רשומה ב-`/api/audit` עם before/after נכונים.
6. README זה מעודכן.
