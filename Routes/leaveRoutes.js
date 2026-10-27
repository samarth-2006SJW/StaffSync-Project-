const express = require("express");
const { authenticate, authorizeRoles } = require("../Middleware/authMiddleware");
const { createLeave, listLeaves, getLeave, updateLeave, reviewLeave, deleteLeave } = require("../Controllers/leaveController");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Leaves
 *   description: Employee leave requests and HR review
 */
/**
 * @swagger
 * /api/leaves:
 *   post:
 *     summary: Submit a leave request for the authenticated employee
 *     tags: [Leaves]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [startDate, endDate, reason]
 *             properties:
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *               reason: { type: string }
 *     responses:
 *       201: { description: Leave request submitted }
 *       400: { description: Invalid request }
 *       401: { description: Authentication required }
 *       404: { description: Employee profile not found }
 *   get:
 *     summary: List own requests or review requests across users (HR and Manager)
 *     tags: [Leaves]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [Pending, Approved, Rejected] } }
 *       - { in: query, name: user, schema: { type: string }, description: HR/Manager-only User ID filter }
 *     responses:
 *       200: { description: Leave requests returned }
 *       400: { description: Invalid filter }
 *       401: { description: Authentication required }
 *       404: { description: Employee profile not found }
 */
router.route("/").post(authenticate, authorizeRoles("Employee"), createLeave).get(authenticate, authorizeRoles("Employee", "HR", "Manager"), listLeaves);

/**
 * @swagger
 * /api/leaves/{id}:
 *   get:
 *     summary: Get a leave request (HR, Manager, or its employee owner)
 *     tags: [Leaves]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Leave request returned }
 *       400: { description: Invalid ID }
 *       401: { description: Authentication required }
 *       403: { description: Request belongs to another employee }
 *       404: { description: Leave request not found }
 *   patch:
 *     summary: Edit own pending leave request
 *     tags: [Leaves]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate: { type: string, format: date }
 *               endDate: { type: string, format: date }
 *               reason: { type: string }
 *     responses:
 *       200: { description: Leave request updated }
 *       400: { description: Invalid fields }
 *       401: { description: Authentication required }
 *       403: { description: Request belongs to another employee }
 *       404: { description: Leave request not found }
 *       409: { description: Request was already reviewed }
 *   delete:
 *     summary: Delete own pending leave request
 *     tags: [Leaves]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Pending request deleted }
 *       401: { description: Authentication required }
 *       403: { description: Request belongs to another employee }
 *       404: { description: Leave request not found }
 *       409: { description: Reviewed requests cannot be deleted }
 */
router.route("/:id").get(authenticate, authorizeRoles("Employee", "HR", "Manager"), getLeave).patch(authenticate, authorizeRoles("Employee"), updateLeave).delete(authenticate, authorizeRoles("Employee"), deleteLeave);

/**
 * @swagger
 * /api/leaves/{id}/status:
 *   patch:
 *     summary: Approve or reject a pending request (HR or Manager)
 *     tags: [Leaves]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [Approved, Rejected] }
 *     responses:
 *       200: { description: Request reviewed }
 *       400: { description: Invalid status }
 *       401: { description: Authentication required }
 *       403: { description: HR role required }
 *       404: { description: Leave request not found }
 *       409: { description: Request already reviewed }
 */
router.patch("/:id/status", authenticate, authorizeRoles("HR", "Manager"), reviewLeave);

module.exports = router;
