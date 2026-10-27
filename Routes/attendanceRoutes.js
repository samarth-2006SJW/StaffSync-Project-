
const express = require("express");
const { authenticate, authorizeRoles } = require("../Middleware/authMiddleware");

const {
  createAttendance,
  getAttendance,
  updateAttendance,
  deleteAttendance,
} = require("../Controllers/attendanceController");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Attendance
 *   description: Attendance management
 */

/**
 * @swagger
 * /api/attendance:
 *   post:
 *     summary: Create attendance
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user, date]
 *             properties:
 *               user:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Calendar day; stored at 00:00 UTC. A valid date-time is also normalized to its UTC day.
 *               checkInTime:
 *                 type: string
 *                 format: date-time
 *               checkOutTime:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [Present, Absent, Half Day]
 *     responses:
 *       201:
 *         description: Attendance created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, data]
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/AttendanceRecord'
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Missing, invalid, or expired login token
 *       403:
 *         description: Only HR can create attendance records
 *       404:
 *         description: User not found
 *       409:
 *         description: Duplicate attendance
 */
router.post("/", authenticate, authorizeRoles("HR"), createAttendance);

/**
 * @swagger
 * /api/attendance:
 *   get:
 *     summary: Get attendance records and HR date coverage
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Optional exact employee name filter (case-insensitive). Multiple matches return 409 with candidate Employee and User IDs.
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Optional calendar date filter. HR receives missingAttendance profiles when name is omitted; these are labeled Not recorded, never inferred Absent.
 *     responses:
 *       200:
 *         description: Attendance records fetched; data contains populated user details when available
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, count, data]
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AttendanceRecord'
 *                 missingAttendance:
 *                   type: array
 *                   description: HR only for date queries without a name; profiles with no saved record are Not recorded, not Absent.
 *                   items:
 *                     type: object
 *                     required: [employee, attendanceStatus]
 *                     properties:
 *                       employee:
 *                         $ref: '#/components/schemas/EmployeeRecord'
 *                       attendanceStatus:
 *                         type: string
 *                         enum: [Not recorded]
 *       400:
 *         description: Invalid employee name, unsupported filter, or invalid calendar date
 *       409:
 *         description: Name matches multiple employees; choose a unique name
 *       401:
 *         description: Missing, invalid, or expired login token
 *       403:
 *         description: Employee can only view their own attendance; Manager access is not enabled
 */
router.get("/", authenticate, authorizeRoles("HR", "Employee"), getAttendance);

/**
 * @swagger
 * /api/attendance/{id}:
 *   patch:
 *     summary: Update an attendance record
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *                 description: Calendar day; stored at 00:00 UTC. A valid date-time is also normalized to its UTC day.
 *               user:
 *                 type: string
 *                 description: User ObjectId to associate with the record
 *               checkInTime:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               checkOutTime:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [Present, Absent, Half Day]
 *     responses:
 *       200:
 *         description: Attendance updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, data]
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/AttendanceRecord'
 *       404:
 *         description: Record not found
 *       400:
 *         description: Invalid attendance ID or field value
 *       409:
 *         description: Another attendance record already exists for this user and day
 *       401:
 *         description: Missing, invalid, or expired login token
 *       403:
 *         description: Only HR can correct attendance records
 */
router.patch("/:id", authenticate, authorizeRoles("HR"), updateAttendance);

/**
 * @swagger
 * /api/attendance/{id}:
 *   delete:
 *     summary: Delete an attendance record
 *     tags: [Attendance]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Attendance deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, data]
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/AttendanceRecord'
 *       404:
 *         description: Record not found
 *       400:
 *         description: Invalid attendance ID
 *       401:
 *         description: Missing, invalid, or expired login token
 *       403:
 *         description: Only HR can delete attendance records
 */
router.delete("/:id", authenticate, authorizeRoles("HR"), deleteAttendance);

/**
 * @swagger
 * components:
 *   schemas:
 *     AttendanceRecord:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         user:
 *           oneOf:
 *             - type: string
 *             - type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 role:
 *                   type: string
 *         date:
 *           type: string
 *           format: date-time
 *         checkInTime:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         checkOutTime:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [Present, Absent, Half Day]
 */

module.exports = router;
