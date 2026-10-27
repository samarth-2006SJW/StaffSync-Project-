const Announcement = require("../Models/Announcement");
const { buildContentController } = require("./contentController");

module.exports = buildContentController({
  Model: Announcement,
  label: "announcement",
  fields: ["title", "message", "createdBy"],
});
