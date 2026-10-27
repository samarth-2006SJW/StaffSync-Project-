
const express = require("express");
const dotenv = require("dotenv");
dotenv.config();

const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");
const connectDB = require("./configs/db");
const { getJwtSecret } = require("./utils/authToken");
const authRoutes = require("./Routes/authRoutes");
const employeeRoutes = require("./Routes/employeeRoutes");
const attendanceRoutes = require("./Routes/attendanceRoutes");
const leaveRoutes = require("./Routes/leaveRoutes");
const announcementRoutes = require("./Routes/announcementRoutes");
const trainingRoutes = require("./Routes/trainingRoutes");

const app = express();

app.use(cors());
app.use(express.json());

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "StaffSync API",
      version: "1.0.0",
      description: "StaffSync HRM Backend API Documentation",
    },
    servers: [
      {
        url: "http://localhost:5000",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./Routes/*.js", "./server.js"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /:
 *   get:
 *     summary: Check if the backend is running
 *     responses:
 *       200:
 *         description: Backend is running
 */
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "StaffSync Backend is running!",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/trainings", trainingRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON payload",
    });
  }

  const statusCode = error.status || error.statusCode;

  if (statusCode && statusCode < 500) {
    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error("Unhandled request error:", error.name);
  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  getJwtSecret();
  await connectDB();

  return app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Server startup failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer, swaggerSpec };
