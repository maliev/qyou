/**
 * Migration: Create contacts table with contact_status enum
 */
exports.up = (pgm) => {
  pgm.createType("contact_status", ["pending", "accepted", "blocked"]);

  pgm.createTable("contacts", {
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    contact_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },
    status: {
      type: "contact_status",
      notNull: true,
      default: "pending",
    },
    created_at: {
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  pgm.addConstraint("contacts", "contacts_pkey", {
    primaryKey: ["user_id", "contact_id"],
  });

  pgm.addConstraint("contacts", "contacts_no_self_add", {
    check: "user_id <> contact_id",
  });

  pgm.createIndex("contacts", "contact_id", { name: "idx_contacts_contact_id" });
  pgm.createIndex("contacts", "status", { name: "idx_contacts_status" });
};

exports.down = (pgm) => {
  pgm.dropTable("contacts");
  pgm.dropType("contact_status");
};
