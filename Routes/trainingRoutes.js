const express = require("express");
const { authenticate, authorizeRoles } = require("../Middleware/authMiddleware");
const { list, get, create, update, remove } = require("../Controllers/trainingController");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Training
 *   description: HR-managed training programs
 * /api/trainings:
 *   get:
 *     summary: List training programs for authenticated users
 *     tags: [Training]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Training programs returned }
 *       401: { description: Authentication required }
 *   post:
 *     summary: Create a training program (HR only)
 *     tags: [Training]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, date]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               date: { type: string, format: date }
 *               trainer: { type: string, default: TBD }
 *               assignedTo: { type: array, items: { type: string } }
 *     responses:
 *       201: { description: Training created }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: HR role required }
 * /api/trainings/{id}:
 *   get:
 *     summary: Get a training program
 *     tags: [Training]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Training returned }
 *       400: { description: Invalid ID }
 *       401: { description: Authentication required }
 *       404: { description: Training not found }
 *   patch:
 *     summary: Update a training program (HR only)
 *     tags: [Training]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               date: { type: string, format: date }
 *               trainer: { type: string }
 *               assignedTo: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Training updated }
 *       400: { description: Invalid input or date order }
 *       401: { description: Authentication required }
 *       403: { description: HR role required }
 *       404: { description: Training not found }
 *   delete:
 *     summary: Delete a training program (HR only)
 *     tags: [Training]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Training deleted }
 *       401: { description: Authentication required }
 *       403: { description: HR role required }
 *       404: { description: Training not found }
 */
router.get("/", authenticate, list);
router.post("/", authenticate, authorizeRoles("HR"), create);
router.get("/:id", authenticate, get);
router.patch("/:id", authenticate, authorizeRoles("HR"), update);
router.delete("/:id", authenticate, authorizeRoles("HR"), remove);

module.exports = router;
