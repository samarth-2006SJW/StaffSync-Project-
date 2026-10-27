# StaffSync backend verification — 27 October 2026

## Implemented schema and API scope

- `User` maps to `Users`; password hashing/comparison, role validation, JWT registration/login, and password-safe serialization are implemented.
- `Employee` maps to `Employees` and references `User`; HR-only CRUD, validation, and unique User/email constraints are implemented.
- `Attendance` maps to `Attendance`; it references `User`, has a unique `{ user, date }` index, and uses nullable ISO 8601 strings for `checkInTime` and `checkOutTime`. The API rejects malformed date-times and normalizes accepted values to UTC ISO strings.
- `Leave` maps to `LeaveRequests`; it references `User`, validates date order, defaults status to `Pending`, and records the reviewing role as `HR` or `Manager`.
- `Announcement` maps to `Announcements`; it has `title`, `message`, and a `createdBy` User reference.
- `Training` maps to `TrainingPrograms`; it has `title`, `description`, `date`, `trainer` defaulting to `TBD`, `createdBy`, and `assignedTo` User references. Assignment rejects duplicate or nonexistent User IDs.

All six models use explicit collection names. Existing collection migration scripts were not run as part of this verification. No application database was accessed or modified.

## Verification

- `npm test`: 52 passed, 0 failed, 1 skipped. The skipped test is the gated real-MongoDB integration suite.
- JavaScript syntax checks passed for all backend JavaScript files.
- Swagger generation and local HTTP smoke tests passed, including health, documentation, authentication routing, unauthorized access, and malformed JSON.
- Unit/controller tests use mocks; local HTTP smoke tests run Express in-process. Neither is database integration coverage.

## Outstanding verification

- Real MongoDB integration has **NOT RUN**: no local MongoDB server, Docker, or Podman runtime was available, and `TEST_MONGO_URI` was not configured. Do not use the application/Atlas database for test cleanup.
- When an isolated MongoDB runtime is available, start it on loopback and run:

  ```sh
  TEST_MONGO_URI=mongodb://127.0.0.1:27018/StaffSync_test RUN_MONGO_INTEGRATION=1 npm run test:integration
  ```

  The test guard requires a separate database ending in `_test` or `-test`; cleanup is restricted to record IDs created by the current run.

- The supplied screenshots identify schema fields but do not fully define every API permission/state rule. Current Leave permissions are Employee-owned submission/edit/delete while pending and HR/Manager review; Announcement writes and Training management are HR-only, with employees restricted to assigned Training programs.
- No external database indexes or existing record shapes were inspected during this verification. No destructive migration or cleanup was performed.
