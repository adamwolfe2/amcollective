"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

type OnlineUser = {
  userId: string;
  userName: string | null;
  userImageUrl: string | null;
  status: string;
  currentPage: string | null;
  lastHeartbeat: string;
};

export function OnlineUsers() {
  const [users, setUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    function fetchPresence() {
      fetch("/api/presence")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setUsers(data);
        })
        .catch(() => {});
    }

    fetchPresence();
    const interval = setInterval(fetchPresence, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (users.length === 0) return null;

  return (
    <div className="border border-[#0A0A0A] bg-white p-4 mb-4">
      <h3 className="font-mono text-[10px] uppercase tracking-widest text-[#0A0A0A]/50 mb-3">
        Online Now
      </h3>
      <div className="flex flex-wrap gap-3">
        {users.map((u) => (
          <div key={u.userId} className="flex items-center gap-2">
            {u.userImageUrl ? (
              <Image
                src={u.userImageUrl}
                alt={u.userName ?? "User"}
                width={24}
                height={24}
                className="rounded-full border border-[#0A0A0A]/10"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[#0A0A0A]/10 flex items-center justify-center">
                <span className="font-mono text-[8px] text-[#0A0A0A]/50">
                  {(u.userName ?? "?")[0]}
                </span>
              </div>
            )}
            <div>
              <p className="font-mono text-xs text-[#0A0A0A]">
                {u.userName ?? "Unknown"}
              </p>
              {u.currentPage && (
                <p className="font-mono text-[9px] text-[#0A0A0A]/30">
                  {u.currentPage}
                </p>
              )}
            </div>
            <span className="w-2 h-2 rounded-full bg-[#0A0A0A] animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
