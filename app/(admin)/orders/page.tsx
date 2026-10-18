"use client";

import React, { Suspense, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

interface OrderItem {
  name: string;
  price: number;
  quantity: number;
  total: number;
}

interface StatusHistoryItem {
  status: string;
  changedAt: string;
  changedBy?: string;
  note?: string;
}

interface OrderRecord {
  _id: string;
  orderNo: string;
  type: "menu" | "custom";
  total: number;
  subtotal: number;
  deliveryCharge: number;
  deliveryType: string;
  address?: string;
  status: string;
  createdAt: string;
  items: OrderItem[];
  customDetails?: {
    description?: string;
    portion?: string;
    notes?: string;
    rawInput?: string;
  };
  quote?: {
    amount?: number;
    note?: string;
  };
  statusHistory: StatusHistoryItem[];
  userId?: {
    _id: string;
    phone: string;
    name?: string;
  };
}

function OrdersContent() {
  const searchParams = useSearchParams();
  const initialType = searchParams.get("type") === "custom" ? "custom" : "menu";

  const [activeTab, setActiveTab] = useState<"menu" | "custom">(initialType);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [quoteModalOrder, setQuoteModalOrder] = useState<OrderRecord | null>(null);
  const [quoteAmount, setQuoteAmount] = useState<string>("");
  const [quoteNote, setQuoteNote] = useState<string>("");

  const [cancelModalOrder, setCancelModalOrder] = useState<OrderRecord | null>(null);
  const [cancelReason, setCancelReason] = useState<string>("");

  const [actionLoading, startTransition] = useTransition();

  async function loadOrders() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("type", activeTab);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dateFilter) params.set("date", dateFilter);

      const res = await fetch(`/api/admin/orders?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setOrders(json.orders || []);
      }
    } catch (e) {
      console.error("Failed to load orders", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, [activeTab, statusFilter, dateFilter]);

  // Handle status update
  async function handleStatusChange(orderId: string, newStatus: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) {
          await loadOrders();
          if (selectedOrder?._id === orderId) {
            setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
          }
        }
      } catch (err) {
        alert("Failed to update status");
      }
    });
  }

  // Handle Set Quote
  async function submitQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!quoteModalOrder || !quoteAmount) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/orders/${quoteModalOrder._id}/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: parseFloat(quoteAmount),
            note: quoteNote || undefined,
          }),
        });

        if (res.ok) {
          setQuoteModalOrder(null);
          setQuoteAmount("");
          setQuoteNote("");
          await loadOrders();
          alert("Quote sent to customer on WhatsApp!");
        } else {
          const err = await res.json();
          alert(err.error || "Failed to submit quote");
        }
      } catch {
        alert("Error sending quote");
      }
    });
  }

  // Handle Cancel Order
  async function submitCancel(e: React.FormEvent) {
    e.preventDefault();
    if (!cancelModalOrder || !cancelReason) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/orders/${cancelModalOrder._id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: cancelReason }),
        });

        if (res.ok) {
          setCancelModalOrder(null);
          setCancelReason("");
          await loadOrders();
          alert("Order cancelled and customer notified via WhatsApp.");
        }
      } catch {
        alert("Error cancelling order");
      }
    });
  }

  const statusColors: Record<string, string> = {
    pending_payment: "bg-amber-50 text-amber-700 border-amber-200",
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    preparing: "bg-blue-50 text-blue-700 border-blue-200",
    out_for_delivery: "bg-purple-50 text-purple-700 border-purple-200",
    delivered: "bg-slate-100 text-slate-700 border-slate-200",
    cancelled: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders Management</h1>
          <p className="text-sm text-slate-500">Monitor live orders, dispatch updates, and quote custom meals</p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex rounded-lg bg-slate-200/80 p-1">
          <button
            onClick={() => setActiveTab("menu")}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === "menu" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Menu Orders
          </button>
          <button
            onClick={() => setActiveTab("custom")}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold transition ${
              activeTab === "custom" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Custom Orders
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-[11px] font-semibold uppercase text-slate-400">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Statuses</option>
            <option value="pending_payment">Pending Payment</option>
            <option value="paid">Paid</option>
            <option value="preparing">Preparing</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase text-slate-400">Date</label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {(statusFilter !== "all" || dateFilter) && (
          <div className="pt-4">
            <button
              onClick={() => {
                setStatusFilter("all");
                setDateFilter("");
              }}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Order No</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">{activeTab === "menu" ? "Items" : "Custom Details"}</th>
                <th className="px-6 py-3">Total</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400 animate-pulse">
                    Loading orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    No orders matching selected criteria.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order._id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-semibold text-slate-900">{order.orderNo}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{order.userId?.name || "Customer"}</div>
                      <div className="text-xs text-slate-400">{order.userId?.phone || "N/A"}</div>
                    </td>
                    <td className="px-6 py-4 max-w-sm text-xs text-slate-600">
                      {order.type === "menu" ? (
                        <div>
                          {order.items?.map((i) => `${i.quantity}x ${i.name}`).join(", ") || "No items"}
                          {order.address && (
                            <div className="mt-0.5 text-[11px] text-slate-400 truncate">
                              📍 {order.deliveryType === "pickup" ? "Self Pickup" : order.address}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="font-medium text-slate-800 line-clamp-2">
                            {order.customDetails?.description || "Custom request"}
                          </div>
                          {order.quote?.amount && (
                            <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                              Quoted: ₹{order.quote.amount}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">
                      {order.total > 0 ? `₹${order.total}` : <span className="text-slate-400">Unquoted</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${statusColors[order.status] || "bg-slate-100 text-slate-700"}`}>
                        {order.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {/* Status Change Selector */}
                        <select
                          disabled={actionLoading || order.status === "cancelled"}
                          value={order.status}
                          onChange={(e) => handleStatusChange(order._id, e.target.value)}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm focus:outline-none"
                        >
                          <option value="pending_payment">Pending Payment</option>
                          <option value="paid">Paid</option>
                          <option value="preparing">Preparing</option>
                          <option value="out_for_delivery">Out for Delivery</option>
                          <option value="delivered">Delivered</option>
                        </select>

                        {/* Set Quote Button for custom orders */}
                        {order.type === "custom" && order.status === "pending_payment" && (
                          <button
                            onClick={() => {
                              setQuoteModalOrder(order);
                              setQuoteAmount(order.quote?.amount?.toString() || "");
                              setQuoteNote(order.quote?.note || "");
                            }}
                            className="rounded bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-amber-600"
                          >
                            Set Quote
                          </button>
                        )}

                        {/* Details Modal Trigger */}
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="rounded border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Details
                        </button>

                        {/* Cancel Button */}
                        {order.status !== "cancelled" && order.status !== "delivered" && (
                          <button
                            onClick={() => {
                              setCancelModalOrder(order);
                              setCancelReason("");
                            }}
                            className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Set Quote Modal */}
      {quoteModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Set Quote for Order {quoteModalOrder.orderNo}</h3>
            <p className="mt-1 text-xs text-slate-500">
              Customer: {quoteModalOrder.userId?.phone}
            </p>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              <span className="font-semibold">Request:</span> {quoteModalOrder.customDetails?.description}
            </div>

            <form onSubmit={submitQuote} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700">Quote Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(e.target.value)}
                  placeholder="E.g. 450"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700">Chef Note / Portions (Optional)</label>
                <input
                  type="text"
                  value={quoteNote}
                  onChange={(e) => setQuoteNote(e.target.value)}
                  placeholder="E.g. Serves 2 people, includes 2 rotis"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setQuoteModalOrder(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionLoading ? "Sending..." : "Send Quote to WhatsApp"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-red-600">Cancel Order {cancelModalOrder.orderNo}</h3>
            <p className="mt-1 text-xs text-slate-500">
              The customer will receive an immediate WhatsApp notification with the reason provided below.
            </p>

            <form onSubmit={submitCancel} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700">Cancellation Reason</label>
                <input
                  type="text"
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="E.g. Item out of stock / Kitchen at maximum capacity"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelModalOrder(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Dismiss
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading ? "Cancelling..." : "Confirm & Notify Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Details Drawer / Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedOrder.orderNo}</h3>
                <span className="text-xs text-slate-500">
                  {new Date(selectedOrder.createdAt).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {/* Customer Details */}
            <div className="mt-4 space-y-3 text-xs">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="font-semibold text-slate-800">Customer</div>
                <div className="mt-1 text-slate-600">{selectedOrder.userId?.name || "Customer"}</div>
                <div className="text-slate-500">📱 {selectedOrder.userId?.phone}</div>
                {selectedOrder.address && (
                  <div className="mt-1 text-slate-600">📍 {selectedOrder.address}</div>
                )}
              </div>

              {/* Items List */}
              {selectedOrder.items?.length > 0 && (
                <div>
                  <div className="font-semibold text-slate-800 mb-2">Order Items</div>
                  <div className="space-y-1 divide-y divide-slate-100">
                    {selectedOrder.items.map((i, idx) => (
                      <div key={idx} className="flex justify-between py-1 text-slate-700">
                        <span>{i.quantity}x {i.name}</span>
                        <span className="font-semibold">₹{i.total}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 font-bold text-slate-900">
                      <span>Total</span>
                      <span>₹{selectedOrder.total}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Status History */}
              <div className="mt-4">
                <div className="font-semibold text-slate-800 mb-2">Status Audit Trail</div>
                <div className="space-y-2 border-l-2 border-slate-200 pl-3">
                  {selectedOrder.statusHistory?.map((h, idx) => (
                    <div key={idx} className="text-[11px]">
                      <span className="font-semibold uppercase text-slate-800">{h.status}</span>
                      <span className="text-slate-400 ml-2">
                        {new Date(h.changedAt).toLocaleTimeString()} by {h.changedBy || "System"}
                      </span>
                      {h.note && <div className="text-slate-500 italic mt-0.5">{h.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedOrder(null)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16 text-slate-400 animate-pulse text-sm">
          Loading orders...
        </div>
      }
    >
      <OrdersContent />
    </Suspense>
  );
}

