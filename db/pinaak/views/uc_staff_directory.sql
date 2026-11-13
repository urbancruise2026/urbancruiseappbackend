-- =============================================================================
-- pinaak — UC Directory + workspace VIEWS over the saarthi (HR) database
-- =============================================================================
--
-- Companion to db/pinaak/views/uc_staff.sql. That file stays UNCHANGED: it
-- serves the login path only and keeps its narrow column set. This file adds
-- three new views, each with one job:
--
--   pinaak.uc_staff_directory      UC Directory list. NO personal number.
--   pinaak.uc_staff_directory_hr   Same + personalMobile. HR path only.
--   pinaak.uc_staff_access         The signed-in staff member's own
--                                  department / sub-department / access role.
--                                  Used to pick the dashboard and to decide
--                                  whether personal numbers may be shown.
--
-- WHY THREE VIEWS AND NOT ONE
--   uc_staff.sql states that the API user "cannot see bank details, date of
--   birth, personal phone or any other HR data". Putting personalMobile into
--   the one directory view would make that statement false, and then only
--   application code would stand between a bug and every employee's personal
--   number. With two views, a mistake in the app cannot select a column that
--   is not in the view it queried.
--   uc_staff_access is separate because access_role is not list data: it
--   describes the VIEWER, and is read one row at a time, by id.
--
-- COLLATION (verified against the live dump, 13 Nov 2026)
--   saarthi.uc_staff, uc_staff_contacts, uc_staff_employment,
--   departments, auth_credentials    -> utf8mb4_unicode_ci
--   saarthi.sub_department, branches -> utf8mb4_0900_ai_ci
--   pinaak                           -> utf8mb4_unicode_ci
--   So subDepartment_name and branch_name (and only those two) carry an
--   explicit COLLATE utf8mb4_unicode_ci. Without it, any comparison mixing
--   them with another column raises
--   "ERROR 1271 Illegal mix of collations for operation 'UNION'".
--
-- TRIM
--   departments.department_name holds 'VEH OPS ' with a trailing space in
--   production, so every text column is trimmed here rather than in the API.
--
-- Run as MySQL root on the server. Safe to re-run: CREATE USER uses
-- IF NOT EXISTS, GRANT is idempotent, the views use CREATE OR REPLACE.
-- See docs/runbooks/uc-staff-directory.md before running on production.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Grants for the existing locked definer account
-- -----------------------------------------------------------------------------
-- The account itself already exists (created by uc_staff.sql) and is LOCKED,
-- so nobody can log in as it. These lines only widen its SELECT to the extra
-- columns the new views read. Column-level, never table-level: it must not be
-- able to read bank accounts, salary, date of birth or documents.

CREATE USER IF NOT EXISTS 'uc_staff_view_definer'@'localhost'
  IDENTIFIED BY RANDOM PASSWORD
  ACCOUNT LOCK;

-- Existing columns plus department_id, sub_department_id, manager_id.
GRANT SELECT (id, first_name, middle_name, last_name, is_active, created_at,
              department_id, sub_department_id, manager_id)
  ON saarthi.uc_staff              TO 'uc_staff_view_definer'@'localhost';

-- `mobile` is the personal number. Read ONLY by uc_staff_directory_hr.
GRANT SELECT (staff_id, office_number, office_email, mobile)
  ON saarthi.uc_staff_contacts     TO 'uc_staff_view_definer'@'localhost';

-- Existing employee_status plus branch_id and joining_date.
GRANT SELECT (staff_id, employee_status, branch_id, joining_date)
  ON saarthi.uc_staff_employment   TO 'uc_staff_view_definer'@'localhost';

GRANT SELECT (id, department_name)
  ON saarthi.departments           TO 'uc_staff_view_definer'@'localhost';

GRANT SELECT (id, subDepartment_name)
  ON saarthi.sub_department        TO 'uc_staff_view_definer'@'localhost';

GRANT SELECT (id, branch_name)
  ON saarthi.branches              TO 'uc_staff_view_definer'@'localhost';

-- access_role only. NEVER password_hash or username.
GRANT SELECT (staff_id, access_role)
  ON saarthi.auth_credentials      TO 'uc_staff_view_definer'@'localhost';


-- -----------------------------------------------------------------------------
-- 2. pinaak.uc_staff_directory — the list every UC user may read
-- -----------------------------------------------------------------------------
-- Every staff member is listed, active and inactive. Staff with no office
-- number are NOT hidden: officeMobileNumber is simply NULL and the app draws
-- one line fewer. (Product decision, 13 Nov 2026.)
--
-- Columns the API reads: see src/modules/uc/uc_staff/repository.ts.

CREATE OR REPLACE
  ALGORITHM = MERGE
  DEFINER = 'uc_staff_view_definer'@'localhost'
  SQL SECURITY DEFINER
VIEW pinaak.uc_staff_directory AS
SELECT
  s.id                                                        AS id,
  NULLIF(TRIM(s.first_name),  '')                             AS firstName,
  NULLIF(TRIM(s.middle_name), '')                             AS middleName,
  NULLIF(TRIM(s.last_name),   '')                             AS lastName,

  -- Office contact only. Personal email is deliberately absent.
  NULLIF(TRIM(c.office_email),  '')                           AS email,
  NULLIF(TRIM(c.office_number), '')                           AS officeMobileNumber,

  -- Org placement. Trimmed; the two 0900_ai_ci columns are re-collated.
  NULLIF(TRIM(d.department_name), '')                         AS department,
  NULLIF(TRIM(sd.subDepartment_name COLLATE utf8mb4_unicode_ci), '')
                                                              AS subDepartment,
  NULLIF(TRIM(b.branch_name COLLATE utf8mb4_unicode_ci), '')  AS branch,

  -- Reporting manager, denormalised so the contact sheet needs no second call.
  s.manager_id                                                AS managerId,
  NULLIF(CONCAT_WS(' ',
    NULLIF(TRIM(m.first_name),  ''),
    NULLIF(TRIM(m.middle_name), ''),
    NULLIF(TRIM(m.last_name),   '')), '')                     AS managerName,

  -- Real joining date, NOT the HR record's creation date. NULL for staff with
  -- no uc_staff_employment row, and for staff id 1, who is Active with no
  -- joining date (verified 13 Nov 2026). The API returns null; it must never
  -- substitute created_at, which would print an invented joining date.
  em.joining_date                                             AS joiningDate,

  -- Identical rule to pinaak.uc_staff, so the directory and login agree.
  CASE
    WHEN s.is_active = 1
     AND LOWER(TRIM(em.employee_status)) = 'active'
    THEN 'Active'
    ELSE 'Inactive'
  END                                                         AS employeeStatus,

  s.created_at                                                AS createdAt

FROM saarthi.uc_staff s
LEFT JOIN saarthi.uc_staff_contacts   c  ON c.staff_id  = s.id
LEFT JOIN saarthi.uc_staff_employment em ON em.staff_id = s.id
LEFT JOIN saarthi.departments         d  ON d.id        = s.department_id
LEFT JOIN saarthi.sub_department      sd ON sd.id       = s.sub_department_id
LEFT JOIN saarthi.branches            b  ON b.id        = em.branch_id
LEFT JOIN saarthi.uc_staff            m  ON m.id        = s.manager_id;


-- -----------------------------------------------------------------------------
-- 3. pinaak.uc_staff_directory_hr — the same list plus the personal number
-- -----------------------------------------------------------------------------
-- Queried ONLY when the signed-in staff member's department is HR
-- (saarthi.departments.id = 4). See src/modules/uc/workspace.ts.
--
-- Built on top of uc_staff_directory so the core columns have one definition.
--
-- CAUTION: `v.*` is expanded when this view is CREATED. If you ever add a
-- column to uc_staff_directory above, you MUST re-run this statement too, or
-- the HR list will silently be missing the new column.

GRANT SELECT ON pinaak.uc_staff_directory TO 'uc_staff_view_definer'@'localhost';

CREATE OR REPLACE
  ALGORITHM = MERGE
  DEFINER = 'uc_staff_view_definer'@'localhost'
  SQL SECURITY DEFINER
VIEW pinaak.uc_staff_directory_hr AS
SELECT
  v.*,
  NULLIF(TRIM(c.mobile), '') AS personalMobile
FROM pinaak.uc_staff_directory v
LEFT JOIN saarthi.uc_staff_contacts c ON c.staff_id = v.id;


-- -----------------------------------------------------------------------------
-- 4. pinaak.uc_staff_access — who the VIEWER is
-- -----------------------------------------------------------------------------
-- One row per staff member, read by id for the signed-in user only. Decides:
--   (a) which dashboard they get              -> resolveWorkspace()
--   (b) whether they may see personal numbers -> canSeePersonalNumbers()
--
-- Read fresh on each request rather than stored in the JWT, so a department
-- change in Saarthi takes effect immediately instead of waiting out the
-- 1-hour access token.
--
-- Ids, not names: department_name is editable and already holds a trailing
-- space in production ('VEH OPS '). An id does not change.

CREATE OR REPLACE
  ALGORITHM = MERGE
  DEFINER = 'uc_staff_view_definer'@'localhost'
  SQL SECURITY DEFINER
VIEW pinaak.uc_staff_access AS
SELECT
  s.id                 AS id,
  s.department_id      AS departmentId,
  s.sub_department_id  AS subDepartmentId,
  -- Saarthi web-app access role: EMPLOYEE, MANAGER, TEAM_LEAD, ZONAL_HEAD,
  -- SUPER_ADMIN, HOD (verified 13 Nov 2026). NULL when the staff member has
  -- no Saarthi web login.
  NULLIF(TRIM(au.access_role), '') AS accessRole,
  CASE
    WHEN s.is_active = 1
     AND LOWER(TRIM(em.employee_status)) = 'active'
    THEN 'Active'
    ELSE 'Inactive'
  END                  AS employeeStatus
FROM saarthi.uc_staff s
LEFT JOIN saarthi.uc_staff_employment em ON em.staff_id = s.id
LEFT JOIN saarthi.auth_credentials    au ON au.staff_id = s.id;


-- -----------------------------------------------------------------------------
-- 5. Grants for the API user
-- -----------------------------------------------------------------------------
-- CONFIRM THE ACCOUNT NAME FIRST. uc_staff.sql names it `uc-pinaak`, but the
-- host part is not recorded there. Run this and use what it returns:
--
--     SELECT user, host FROM mysql.user WHERE user LIKE 'uc%';
--
-- Then run the three GRANTs below with the correct 'user'@'host'. The API user
-- gets SELECT on these views and NOTHING in the saarthi schema.

-- GRANT SELECT ON pinaak.uc_staff_directory    TO 'uc-pinaak'@'localhost';
-- GRANT SELECT ON pinaak.uc_staff_directory_hr TO 'uc-pinaak'@'localhost';
-- GRANT SELECT ON pinaak.uc_staff_access       TO 'uc-pinaak'@'localhost';

FLUSH PRIVILEGES;