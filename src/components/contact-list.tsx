type ContactItem = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
};

export function ContactList({ contacts }: { contacts: ContactItem[] }) {
  if (contacts.length === 0) {
    return <p className="text-sm text-neutral-600">No contacts yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Title</th>
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Phone</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {contacts.map((c) => (
            <tr key={c.id} className="hover:bg-neutral-50">
              <td className="px-4 py-2 font-medium text-neutral-900">
                {c.name}
                {c.isPrimary && (
                  <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                    primary
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-neutral-600">{c.title ?? "—"}</td>
              <td className="px-4 py-2 text-neutral-600">{c.email ?? "—"}</td>
              <td className="px-4 py-2 text-neutral-600">{c.phone ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
