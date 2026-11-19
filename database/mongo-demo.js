// Run in mongosh connected to the project database: use returnly

// 1. Category counts: same aggregation shape used by Insights.
db.disputeSummaries.aggregate([
  { $group: { _id: "$reason", count: { $sum: 1 } } },
  { $project: { _id: 0, reason: "$_id", count: 1 } },
  { $sort: { count: -1 } }
]);

// 2. A buyer-scoped summary: seeded primary buyer UUID.
db.disputeSummaries.aggregate([
  { $match: { buyerId: "10000000-0000-4000-8000-000000000001" } },
  { $group: { _id: "$status", count: { $sum: 1 } } }
]);

// 3. Read a stored conversation in chronological order.
db.messages.find({ disputeId: "10000000-0000-4000-8000-000000000201" }).sort({ createdAt: 1 });

// 4. Flexible evidence metadata and GridFS storage (uploads create these).
db.evidence.find({}, { filename: 1, mime: 1, size: 1, disputeId: 1 });
db.evidenceFiles.files.find({}, { filename: 1, length: 1, uploadDate: 1, metadata: 1 });

// 5. Messages by participant role.
db.messages.aggregate([{ $group: { _id: "$role", messages: { $sum: 1 } } }]);
