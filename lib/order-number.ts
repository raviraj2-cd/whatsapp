import Counter from "@/models/Counter";

/**
 * Generates an atomic, collision-free order number formatted as ORD-YYYYMMDD-XXX.
 * Sequences reset daily using an atomic MongoDB findOneAndUpdate with $inc.
 */
export async function generateOrderNumber(date: Date = new Date()): Promise<string> {
  const yyyy = date.getFullYear().toString();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const dateKey = `${yyyy}${mm}${dd}`;
  const counterKey = `order_${dateKey}`;

  const counter = await Counter.findOneAndUpdate(
    { key: counterKey },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const sequenceNumber = String(counter.seq).padStart(3, "0");
  return `ORD-${dateKey}-${sequenceNumber}`;
}

export default generateOrderNumber;
