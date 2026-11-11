-- =============================================================================
-- pinaak.uc_staff — VIEW over the saarthi (HR) database
-- =============================================================================
--
-- Saarthi is the only source of truth for UC staff. This view lets the mobile
-- API keep reading `pinaak.uc_staff` with one database connection, while
-- every create / update / deactivate / delete done in saarthi shows up here
-- instantly. There is no copy of the data and no sync job.
--
-- Used by: src/modules/auth/repository/users-uc-staff.ts (UC login, status
-- check on refresh / me / MPIN unlock, profile). Column names match what that
-- file reads, so it needs no SQL change.
--
-- Rules built into the view:
--   officeMobileNumber = saarthi.uc_staff_contacts.office_number (login number)
--   email              = saarthi.uc_staff_contacts.office_email
--   employeeStatus     = 'Active' only when BOTH
--                          saarthi.uc_staff.is_active = 1 AND
--                          saarthi.uc_staff_employment.employee_status = 'Active'
--                        (any case / spaces); otherwise 'Inactive'.
--
-- Security:
--   - The view runs as `uc_staff_view_definer`@`localhost` (SQL SECURITY
--     DEFINER). That account is LOCKED (nobody can log in with it) and can
--     SELECT only the 11 saarthi columns below.
--   - The API user (uc-pinaak) needs no saarthi permission at all. It reads
--     this view only, and cannot see bank details, date of birth, personal
--     phone or any other HR data.
--   - Writes through the view (UPDATE / INSERT / DELETE) are refused, because
--     the definer has SELECT only.
--
-- Run as MySQL root on the server. Safe to re-run: the user and grants use
-- IF NOT EXISTS / GRANT (idempotent), the view uses CREATE OR REPLACE.
--
-- To change the view later (e.g. saarthi renames a column): edit this file,
-- add any new column to the GRANT lines, then run it again.
-- =============================================================================

-- 1. Locked account the view runs as. Its random password is never used.
CREATE USER IF NOT EXISTS 'uc_staff_view_definer'@'localhost'
  IDENTIFIED BY RANDOM PASSWORD
  ACCOUNT LOCK;

-- 2. Read access to only the saarthi columns the view uses.
GRANT SELECT (id, first_name, middle_name, last_name, is_active, created_at)
  ON saarthi.uc_staff            TO 'uc_staff_view_definer'@'localhost';
GRANT SELECT (staff_id, office_number, office_email)
  ON saarthi.uc_staff_contacts   TO 'uc_staff_view_definer'@'localhost';
GRANT SELECT (staff_id, employee_status)
  ON saarthi.uc_staff_employment TO 'uc_staff_view_definer'@'localhost';

-- 3. The view. During go-live it is first created as `uc_staff_new` and
--    swapped in (see docs/runbooks/uc-staff-view.md). After go-live, this
--    statement replaces the live view directly.
CREATE OR REPLACE
  ALGORITHM = MERGE
  DEFINER = 'uc_staff_view_definer'@'localhost'
  SQL SECURITY DEFINER
VIEW pinaak.uc_staff AS
SELECT
  s.id                AS id,
  s.first_name        AS firstName,
  s.middle_name       AS middleName,
  s.last_name         AS lastName,
  c.office_email      AS email,
  c.office_number     AS officeMobileNumber,
  CASE
    WHEN s.is_active = 1
     AND LOWER(TRIM(e.employee_status)) = 'active'
    THEN 'Active'
    ELSE 'Inactive'
  END                 AS employeeStatus,
  s.created_at        AS created_at
FROM saarthi.uc_staff s
LEFT JOIN saarthi.uc_staff_contacts   c ON c.staff_id = s.id
LEFT JOIN saarthi.uc_staff_employment e ON e.staff_id = s.id;