const express = require("express");
const { authenticate, authorizeRoles } = require("../Middleware/authMiddleware");
const { list, get, create, update, remove } = require("../Controllers/announcementController");
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Announcements
 *   description: HR-managed staff announcements
 * /api/announcements:
 *   get:
 *     summary: List announcements available to authenticated users
 *     tags: [Announcements]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Announcements returned }
 *       401: { description: Authentication required }
 *   post:
 *     summary: Create an announcement (HR only)
 *     tags: [Announcements]
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, message]
 *             properties:
 *               title: { type: string }
 *               message: { type: string }
 *     responses:
 *       201: { description: Announcement created }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: HR role required }
 * /api/announcements/{id}:
 *   get:
 *     summary: Get an announcement
 *     tags: [Announcements]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Announcement returned }
 *       400: { description: Invalid ID }
 *       401: { description: Authentication required }
 *       404: { description: Announcement not found }
 *   patch:
 *     summary: Update an announcement (HR only)
 *     tags: [Announcements]
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
 *               message: { type: string }
 *     responses:
 *       200: { description: Announcement updated }
 *       400: { description: Invalid input }
 *       401: { description: Authentication required }
 *       403: { description: HR role required }
 *       404: { description: Announcement not found }
 *   delete:
 *     summary: Delete an announcement (HR only)
 *     tags: [Announcements]
 *     security: [{ BearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: Announcement deleted }
 *       401: { description: Authentication required }
 *       403: { description: HR role required }
 *       404: { description: Announcement not found }
 */
router.get("/", authenticate, list);
router.post("/", authenticate, authorizeRoles("HR"), create);
router.get("/:id", authenticate, get);
router.patch("/:id", authenticate, authorizeRoles("HR"), update);
router.delete("/:id", authenticate, authorizeRoles("HR"), remove);

module.exports = router;
