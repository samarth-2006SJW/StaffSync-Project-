const express = require("express");
const { authenticate, authorizeRoles } = require("../Middleware/authMiddleware");
const {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} = require("../Controllers/employeeController");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Employees
 *   description: HR-managed employee profiles, separate from login User accounts
 */

/**
 * @swagger
 * /api/employees:
 *   get:
 *     summary: List employee profiles; optionally search by name
 *     description: HR only. Name search is case-insensitive and matches partial names. Duplicate names are returned as separate profiles with email, department, position, and profile ID to distinguish them.
 *     tags: [Employees]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         required: false
 *         schema:
 *           type: string
 *         description: Partial or full employee name. Omit it to list all employee profiles.
 *     responses:
 *       200:
 *         description: Employee profiles fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, count, employees]
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 employees:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EmployeeRecord'
 *       400:
 *         description: Invalid or unsupported search parameter
 *       401:
 *         description: Missing, invalid, or expired login token
 *       403:
 *         description: Only HR can list employee profiles
 *       500:
 *         description: Server error
 */
router.get("/", authenticate, authorizeRoles("HR"), getEmployees);

/**
 * @swagger
 * /api/employees/{id}:
 *   get:
 *     summary: Get one employee profile
 *     description: HR only. This returns the Employee profile and safe linked User identity fields; it never returns the User password.
 *     tags: [Employees]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[a-fA-F0-9]{24}$'
 *     responses:
 *       200:
 *         description: Employee profile fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, employee]
 *               properties:
 *                 success:
 *                   type: boolean
 *                 employee:
 *                   $ref: '#/components/schemas/EmployeeRecord'
 *       400:
 *         description: Invalid employee ID
 *       401:
 *         description: Missing, invalid, or expired login token
 *       403:
 *         description: Only HR can read employee profiles
 *       404:
 *         description: Employee profile not found
 *       500:
 *         description: Server error
 */
router.get("/:id", authenticate, authorizeRoles("HR"), getEmployeeById);

/**
 * @swagger
 * /api/employees:
 *   post:
 *     summary: Create an employee profile linked to an existing User
 *     description: HR only. The user field is the existing User MongoDB ID. Creating an Employee does not create or modify the linked User account.
 *     tags: [Employees]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmployeeCreate'
 *     responses:
 *       201:
 *         description: Employee profile created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, employee]
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 employee:
 *                   $ref: '#/components/schemas/EmployeeRecord'
 *       400:
 *         description: Invalid input or unsupported field
 *       401:
 *         description: Missing, invalid, or expired login token
 *       403:
 *         description: Only HR can create employee profiles
 *       404:
 *         description: Linked User account not found
 *       409:
 *         description: A profile already exists for this User or email
 *       500:
 *         description: Server error
 */
router.post("/", authenticate, authorizeRoles("HR"), createEmployee);

/**
 * @swagger
 * /api/employees/{id}:
 *   patch:
 *     summary: Update supplied employee profile fields
 *     description: HR only. The linked User relationship is immutable; use only fields defined by EmployeeUpdate.
 *     tags: [Employees]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[a-fA-F0-9]{24}$'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EmployeeUpdate'
 *     responses:
 *       200:
 *         description: Employee profile updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, employee]
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 employee:
 *                   $ref: '#/components/schemas/EmployeeRecord'
 *       400:
 *         description: Invalid ID, empty update, invalid field, or unsupported field
 *       401:
 *         description: Missing, invalid, or expired login token
 *       403:
 *         description: Only HR can update employee profiles
 *       404:
 *         description: Employee profile not found
 *       409:
 *         description: Email conflicts with another profile
 *       500:
 *         description: Server error
 */
router.patch("/:id", authenticate, authorizeRoles("HR"), updateEmployee);

/**
 * @swagger
 * /api/employees/{id}:
 *   delete:
 *     summary: Delete an employee profile
 *     description: HR only. Deletes the Employee profile only; the linked User login account remains.
 *     tags: [Employees]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[a-fA-F0-9]{24}$'
 *     responses:
 *       200:
 *         description: Employee profile deleted; linked User account kept
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, employee]
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 employee:
 *                   $ref: '#/components/schemas/EmployeeRecord'
 *       400:
 *         description: Invalid employee ID
 *       401:
 *         description: Missing, invalid, or expired login token
 *       403:
 *         description: Only HR can delete employee profiles
 *       404:
 *         description: Employee profile not found
 *       500:
 *         description: Server error
 */
router.delete("/:id", authenticate, authorizeRoles("HR"), deleteEmployee);

/**
 * @swagger
 * components:
 *   schemas:
 *     EmployeeLinkedUser:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         name:
 *           type: string
 *           maxLength: 120
 *         email:
 *           type: string
 *         role:
 *           type: string
 *           enum: [HR, Employee, Manager]
 *     EmployeeRecord:
 *       type: object
 *       required: [_id, user, name, email, department, position, salary, joinDate]
 *       properties:
 *         _id:
 *           type: string
 *         user:
 *           oneOf:
 *             - type: string
 *             - $ref: '#/components/schemas/EmployeeLinkedUser'
 *           nullable: true
 *           description: Linked User ID or safe populated identity; null if a legacy link is missing.
 *         name:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         department:
 *           type: string
 *           maxLength: 100
 *         position:
 *           type: string
 *           maxLength: 120
 *         salary:
 *           type: number
 *           minimum: 0
 *         joinDate:
 *           type: string
 *           format: date
 *         phone:
 *           type: string
 *         address:
 *           type: string
 *     EmployeeCreate:
 *       type: object
 *       additionalProperties: false
 *       required: [user, name, email, department, position, salary, joinDate]
 *       properties:
 *         user:
 *           type: string
 *           pattern: '^[a-fA-F0-9]{24}$'
 *           description: Existing User MongoDB ID
 *         name:
 *           type: string
 *           maxLength: 120
 *         email:
 *           type: string
 *           format: email
 *         department:
 *           type: string
 *           maxLength: 100
 *         position:
 *           type: string
 *           maxLength: 120
 *         salary:
 *           type: number
 *           minimum: 0
 *         joinDate:
 *           type: string
 *           format: date
 *         phone:
 *           type: string
 *           maxLength: 40
 *         address:
 *           type: string
 *           maxLength: 500
 *     EmployeeUpdate:
 *       type: object
 *       additionalProperties: false
 *       minProperties: 1
 *       properties:
 *         name:
 *           type: string
 *           maxLength: 120
 *         email:
 *           type: string
 *           format: email
 *         department:
 *           type: string
 *           maxLength: 100
 *         position:
 *           type: string
 *           maxLength: 120
 *         salary:
 *           type: number
 *           minimum: 0
 *         joinDate:
 *           type: string
 *           format: date
 *         phone:
 *           type: string
 *           maxLength: 40
 *         address:
 *           type: string
 *           maxLength: 500
 */

module.exports = router;
