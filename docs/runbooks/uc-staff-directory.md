# Runbook — UC Directory views (`uc_staff_directory`, `_hr`, `uc_staff_access`)

Companion to `uc-staff-view.md`, which covers the login view `pinaak.uc_staff`.
**That view is not touched by this change.** If anything here goes wrong, UC
login keeps working.

Everything below is run as MySQL `root` on the database server.

---

## Before you start

Have ready:

- `db/pinaak/views/uc_staff_directory.sql`
- The API user's exact name and host. `uc_staff.sql` calls it `uc-pinaak` but
  does not record the host:

```sql
SELECT user, host FROM mysql.user WHERE user LIKE 'uc%';
```

---

## Step 1 — Take a copy of what exists now

```sql
SHOW CREATE VIEW pinaak.uc_staff\G
SHOW GRANTS FOR 'uc_staff_view_definer'@'localhost';
```

Save both outputs. They are the rollback.

---

## Step 2 — Run the file

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p < db/pinaak/views/uc_staff_directory.sql
```

It is safe to re-run: `CREATE USER IF NOT EXISTS`, idempotent `GRANT`,
`CREATE OR REPLACE VIEW`.

The API-user grants at the end of the file are commented out on purpose.
Uncomment them with the name and host from Step 1, or run them by hand.

---

## Step 3 — Prove the login view is unchanged

```sql
SHOW CREATE VIEW pinaak.uc_staff\G
```

Compare with the copy from Step 1. It must be identical. If it is not, stop
and restore it before going further.

---

## Step 4 — Check the views return what they should

Expected numbers as of 13 Nov 2026. Yours will drift as HR edits records; what
matters is that the shape is right, not the exact figure.

```sql
-- 84 rows, 74 of them Active
SELECT employeeStatus, COUNT(*) FROM pinaak.uc_staff_directory GROUP BY employeeStatus;

-- Branch 100% filled. Two values: Mumbai Office (50), Delhi Office (34).
SELECT branch, COUNT(*) FROM pinaak.uc_staff_directory GROUP BY branch;

-- Six departments, trimmed. 'VEH OPS' must come back WITHOUT a trailing space,
-- which is why this wraps the value in brackets.
SELECT CONCAT('[', department, ']') AS dept, COUNT(*)
  FROM pinaak.uc_staff_directory GROUP BY department ORDER BY 2 DESC;

-- The HR view has one extra column and the same row count.
SELECT COUNT(*) FROM pinaak.uc_staff_directory_hr;
SELECT COUNT(personalMobile) AS with_personal FROM pinaak.uc_staff_directory_hr;

-- The base view must NOT have that column. This has to FAIL with
-- "Unknown column 'personalMobile'". If it succeeds, STOP — the views are
-- wrong and personal numbers would be served to everyone.
SELECT personalMobile FROM pinaak.uc_staff_directory LIMIT 1;

-- Access view: the six access roles.
SELECT accessRole, COUNT(*) FROM pinaak.uc_staff_access GROUP BY accessRole;
```

---

## Step 5 — Prove the views are read-only

Each of these must be refused, because the definer holds `SELECT` only.

```sql
UPDATE pinaak.uc_staff_directory SET branch = 'x' WHERE id = 1;
DELETE FROM pinaak.uc_staff_access WHERE id = 1;
```

---

## Step 6 — Prove the API user is still walled off from saarthi

Log in as the API user and run these. Every one must be refused.

```sql
SELECT * FROM saarthi.uc_staff_bank_accounts LIMIT 1;   -- bank details
SELECT * FROM saarthi.uc_staff_compensation  LIMIT 1;   -- CTC and salary
SELECT password_hash FROM saarthi.auth_credentials LIMIT 1;
SELECT date_of_birth FROM saarthi.uc_staff LIMIT 1;
```

And these must succeed:

```sql
SELECT COUNT(*) FROM pinaak.uc_staff_directory;
SELECT COUNT(*) FROM pinaak.uc_staff_directory_hr;
SELECT COUNT(*) FROM pinaak.uc_staff_access;
```

---

## Step 7 — Deploy the API, then check from the app

```
GET /api/v1/uc/workspace   as a Tele-Sales person -> "telesales"
GET /api/v1/uc/workspace   as another Sales person -> "sales"
GET /api/v1/uc/workspace   as the HOD or SUPER_ADMIN -> "admin"
GET /api/v1/uc/staff       as a non-HR person -> no phoneAlt on any item
GET /api/v1/uc/staff       as an HR person -> phoneAlt on some items
```

The last two are the ones to check carefully. Grep the non-HR response for
`phoneAlt`; there must be no match.

---

## Rollback

```sql
DROP VIEW IF EXISTS pinaak.uc_staff_directory_hr;
DROP VIEW IF EXISTS pinaak.uc_staff_directory;
DROP VIEW IF EXISTS pinaak.uc_staff_access;
```

`pinaak.uc_staff` is untouched, so login is unaffected. Roll the API back to
the previous release; the app falls back to whatever it did before.

The extra `GRANT`s can stay — they are column-level `SELECT` on an account
that is `ACCOUNT LOCK`ed and cannot log in. Revoke them if you prefer:

```sql
REVOKE SELECT ON saarthi.departments      FROM 'uc_staff_view_definer'@'localhost';
REVOKE SELECT ON saarthi.sub_department   FROM 'uc_staff_view_definer'@'localhost';
REVOKE SELECT ON saarthi.branches         FROM 'uc_staff_view_definer'@'localhost';
REVOKE SELECT ON saarthi.auth_credentials FROM 'uc_staff_view_definer'@'localhost';
```

---

## Changing the views later

1. **Adding a column to `uc_staff_directory`** — you must also re-run the
   `uc_staff_directory_hr` statement. It is defined with `v.*`, which MySQL
   expands at creation time, so the HR view will silently lack the new column
   until it is recreated.
2. **Reading a new saarthi column** — add it to the matching `GRANT` line
   first, or the view will fail at query time, not at creation time.
3. **Saarthi renames a column** — edit the file, update the `GRANT`s, re-run.

---

## Known data problems (not fixable in code)

Verified 13 Nov 2026. Of 74 active staff, only **38** can log into the app.

| Reason | Staff |
|---|---|
| No office number at all | 22 |
| Number is not 10 digits (staff ids 8, 21, 82) | 2 |
| Same number given to 2 or more staff (4 numbers, one shared by 4 people) | 12 |
| Can log in | 38 |

The shared numbers are refused on purpose: `findUcStaffByPhone()` throws
`ACCOUNT_AMBIGUOUS` (409) rather than guess which account to open. Guessing
could sign someone into a colleague's account.

Separately, only **13 of 74** active staff have an `office_email`, so most
directory cards show no email line.

All of these are Saarthi data-entry problems. Raise them with whoever
maintains Saarthi; no change to this code can fix them.