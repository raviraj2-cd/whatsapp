"use client";

import React, { useEffect, useState } from "react";

export const dynamic = "force-dynamic";

interface MenuItem {
  _id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
  description?: string;
}

export default function MenuManagementPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Menu Catalog</h1>
          <p className="text-sm text-slate-500">Manage kitchen menu items, pricing, and live availability</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 text-xl font-bold">
          🍽️
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-900">Menu Management</h3>
        <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
          Menu items are synced directly with the WhatsApp Food Ordering catalog. Seeded items are loaded from MongoDB Atlas.
        </p>
      </div>
    </div>
  );
}
