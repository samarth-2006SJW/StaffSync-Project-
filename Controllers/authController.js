
const User = require("../Models/User");
const { createAccessToken } = require("../utils/authToken");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BCRYPT_PASSWORD_BYTES = 72;

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const isValidEmail = (value) =>
  isNonEmptyString(value) &&
  value.length <= 254 &&
  EMAIL_PATTERN.test(value.trim());

const publicUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.department,
});

const register = async (req, res) => {
  try {
    const { name, email, password, department } = req.body || {};

    if (
      !isNonEmptyString(name) ||
      !isValidEmail(email) ||
      typeof password !== "string" ||
      Buffer.byteLength(password, "utf8") < 8 ||
      Buffer.byteLength(password, "utf8") > MAX_BCRYPT_PASSWORD_BYTES ||
      (department !== undefined && typeof department !== "string")
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Provide a name, valid email, password of 8 to 72 bytes, and an optional text department",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered",
      });
    }

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      department,
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email is already registered",
      });
    }

    if (error.name === "ValidationError" || error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Registration error:", error.name);
    return res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!isValidEmail(email) || typeof password !== "string" || !password) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid email and password",
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select(
      "+password"
    );

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = createAccessToken(user._id);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login error:", error.name);
    return res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
};

module.exports = { register, login };
