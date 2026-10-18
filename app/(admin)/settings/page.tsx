"use client";

import React from "react";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Kitchen Settings</h1>
          <p className="text-sm text-slate-500">Configure operating hours, cutoff times, delivery charges, and Meta Flow IDs</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 text-xl font-bold">
          ⚙️
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-900">Operational Configuration</h3>
        <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
          Manage kitchen cutoffs (e.g. 19:30 IST), delivery fee rates (₹30), and active Meta WhatsApp Flow IDs.
        </p>
      </div>
    </div>
  );
}
