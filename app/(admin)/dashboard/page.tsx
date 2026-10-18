"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface OverviewData {
  metrics: {
    todayOrdersCount: number;
    todayRevenue: number;
    pendingCustomRequests: number;
    broadcast: {
      date: string;
      sentCount: number;
      yesCount: number;
      noCount: number;
      noReplyCount: number;
      responseRate: number;
    };
  };
  recentOrders: Array<{
    _id: string;
    orderNo: string;
    type: "menu" | "custom";
    total: number;
    status: string;
    createdAt: string;
    userId?: { phone?: string; name?: string };
    items?: Array<{ name: string; quantity: number }>;
  }>;
}

export default function DashboardOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newOrderAlert, setNewOrderAlert] = useState<string | null>(null);
  const [lastOrderCount, setLastOrderCount] = useState<number | null>(null);

  async function fetchOverview() {
    try {
      const res = await fetch("/api/admin/overview");
      if (res.ok) {
        const json: OverviewData = await res.json();
        setData(json);

        // New order detection for alert
        if (lastOrderCount !== null && json.metrics.todayOrdersCount > lastOrderCount) {
          const diff = json.metrics.todayOrdersCount - lastOrderCount;
          setNewOrderAlert(`🚨 New order received! (+${diff} order${diff > 1 ? "s" : ""})`);
        }
        setLastOrderCount(json.metrics.todayOrdersCount);
      }
    } catch (e) {
      console.error("Failed to load overview data", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOverview();
    // Poll every 20 seconds for real-time order alerts
    const interval = setInterval(fetchOverview, 20000);
    return () => clearInterval(interval);
  }, [lastOrderCount]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-sm font-medium text-slate-500 animate-pulse">Loading dashboard metrics...</div>
      </div>
    );
  }

  const metrics = data?.metrics;
  const broadcast = metrics?.broadcast;

  return (
    <div className="space-y-6">
      {/* Real-time Order Alert Banner */}
      {newOrderAlert && (
        <div className="flex items-center justify-between rounded-xl bg-emerald-500 px-4 py-3 text-white shadow-md animate-bounce">
          <div className="flex items-center gap-2 font-medium text-sm">
            <span>{newOrderAlert}</span>
          </div>
          <button
            onClick={() => setNewOrderAlert(null)}
            className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold hover:bg-emerald-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Today's Kitchen Overview</h1>
          <p className="text-sm text-slate-500">Live ordering activity and customer broadcast performance</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
            Polling live (20s)
          </span>
          <button
            onClick={() => fetchOverview()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Today's Orders */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Today's Orders</div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">{metrics?.todayOrdersCount || 0}</div>
          <p className="mt-1 text-xs text-slate-500">Total orders received today</p>
        </div>

        {/* Card 2: Revenue */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Today's Revenue</div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-600">₹{metrics?.todayRevenue || 0}</div>
          <p className="mt-1 text-xs text-slate-500">Settled & paid orders</p>
        </div>

        {/* Card 3: Pending Custom Requests */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Custom Orders Awaiting Quote</div>
          <div className="mt-2 text-3xl font-extrabold text-amber-600">{metrics?.pendingCustomRequests || 0}</div>
          <div className="mt-1">
            <Link href="/orders?type=custom" className="text-xs font-semibold text-amber-700 hover:underline">
              Review custom requests →
            </Link>
          </div>
        </div>

        {/* Card 4: Daily Broadcast Response Rate */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Broadcast Response Rate</div>
          <div className="mt-2 text-3xl font-extrabold text-indigo-600">{broadcast?.responseRate || 0}%</div>
          <p className="mt-1 text-xs text-slate-500">
            {broadcast?.yesCount || 0} Yes • {broadcast?.noCount || 0} No • {broadcast?.noReplyCount || 0} No Reply
          </p>
        </div>
      </div>

      {/* Broadcast Performance Breakdown */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Today's WhatsApp Broadcast Performance</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
            <div className="text-xs text-slate-500 font-medium">Broadcast Sent</div>
            <div className="mt-1 text-xl font-bold text-slate-800">{broadcast?.sentCount || 0}</div>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3.5 border border-emerald-100">
            <div className="text-xs text-emerald-700 font-medium">"Yes" Hungry</div>
            <div className="mt-1 text-xl font-bold text-emerald-700">{broadcast?.yesCount || 0}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
            <div className="text-xs text-slate-500 font-medium">"No" Declined</div>
            <div className="mt-1 text-xl font-bold text-slate-700">{broadcast?.noCount || 0}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
            <div className="text-xs text-slate-500 font-medium">Awaiting Reply</div>
            <div className="mt-1 text-xl font-bold text-slate-400">{broadcast?.noReplyCount || 0}</div>
          </div>
        </div>
      </div>

      {/* Recent Orders List */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-bold text-slate-900">Recent Customer Orders</h2>
          <Link href="/orders" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700">
            View All Orders →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Order No</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Items / Note</th>
                <th className="px-6 py-3">Total</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(!data?.recentOrders || data.recentOrders.length === 0) ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    No orders placed yet today.
                  </td>
                </tr>
              ) : (
                data.recentOrders.map((order) => {
                  const statusColors: Record<string, string> = {
                    pending_payment: "bg-amber-50 text-amber-700 border-amber-200",
                    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    preparing: "bg-blue-50 text-blue-700 border-blue-200",
                    out_for_delivery: "bg-purple-50 text-purple-700 border-purple-200",
                    delivered: "bg-slate-100 text-slate-700 border-slate-200",
                    cancelled: "bg-red-50 text-red-700 border-red-200",
                  };

                  return (
                    <tr key={order._id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3.5 font-semibold text-slate-900">{order.orderNo}</td>
                      <td className="px-6 py-3.5">
                        <div className="font-medium text-slate-800">{order.userId?.name || "Customer"}</div>
                        <div className="text-xs text-slate-400">{order.userId?.phone || "N/A"}</div>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="capitalize text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {order.type}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600 max-w-xs truncate">
                        {order.items?.map((i) => `${i.quantity}x ${i.name}`).join(", ") || "Custom meal request"}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-slate-900">₹{order.total}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${statusColors[order.status] || "bg-slate-100 text-slate-700"}`}>
                          {order.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-400">
                        {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
