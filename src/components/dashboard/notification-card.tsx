type NotificationCardProps = {
  title: string;
  subtitle: string;
  colorClass: string;
};

export function NotificationCard({ title, subtitle, colorClass }: NotificationCardProps) {
  return (
    <article
      className={`dashboard-fade-up rounded-3xl border border-white/70 bg-gradient-to-br p-5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.35)] sm:p-6 ${colorClass}`}
    >
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-2 text-sm opacity-90">{subtitle}</p>
    </article>
  );
}