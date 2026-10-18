"use client";

import React from "react";

export const dynamic = "force-dynamic";

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customer Profiles</h1>
          <p className="text-sm text-slate-500">View customer WhatsApp contacts, opt-in statuses, and addresses</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600 text-xl font-bold">
          👥
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-900">Customer Directory</h3>
        <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
          Customer profiles are created automatically upon inbound WhatsApp interaction and managed in MongoDB.
        </p>
      </div>
    </div>
  );
}
