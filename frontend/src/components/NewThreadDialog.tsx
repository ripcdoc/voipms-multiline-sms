import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export function NewThreadDialog({ onClose }: { onClose: () => void }) {
  const { data: dids } = useQuery({ queryKey: ["dids"], queryFn: api.listDids });
  const [didId, setDidId] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: () => {
      const did = dids?.find((d) => String(d.id) === didId);
      if (!did) throw new Error("Choose a line");
      return api.createThread(did.did, contactNumber.trim());
    },
    onSuccess: (thread) => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      onClose();
      navigate(`/thread/${thread.id}`);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!didId || !contactNumber.trim() || create.isPending) return;
    create.mutate();
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-navy-950/55" onClick={onClose}>
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] rounded-lg border border-gold-500/20 bg-navy-800 p-6 shadow-4"
      >
        <div className="eyebrow eyebrow--on-dark mb-1">New dispatch</div>
        <p className="mb-4.5 text-xs text-navy-300">Open a fresh wire to a contact.</p>

        <label className="mb-1.5 block text-[11px] text-navy-300">From (your line)</label>
        <select
          value={didId}
          onChange={(e) => setDidId(e.target.value)}
          className="mb-3.5 w-full rounded border border-navy-600 bg-navy-900 px-2.5 py-2.5 text-sm text-white outline-none"
        >
          <option value="">Select a line…</option>
          {dids?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} ({d.did})
            </option>
          ))}
        </select>

        <label className="mb-1.5 block text-[11px] text-navy-300">To (contact number)</label>
        <input
          value={contactNumber}
          onChange={(e) => setContactNumber(e.target.value)}
          placeholder="e.g. 5551234567"
          className="mb-4.5 w-full rounded border border-navy-600 bg-navy-900 px-2.5 py-2.5 text-sm text-white outline-none"
        />

        {create.isError && <p className="mb-4 text-xs text-[#e08a7a]">{(create.error as Error).message}</p>}

        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} className="px-3.5 py-2 text-sm text-navy-300 hover:text-white">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!didId || !contactNumber.trim() || create.isPending}
            className="rounded-full bg-gold-500 px-4.5 py-2 text-sm font-bold text-navy-900 disabled:opacity-50"
          >
            {create.isPending ? "Starting…" : "Start"}
          </button>
        </div>
      </form>
    </div>
  );
}
