type CardProps = {
  title?: string;
  value?: string;
  description?: string;
  children?: React.ReactNode;
};

export function Card({ title, value, description, children }: CardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {title && (
        <div className="mb-2 text-sm font-medium text-slate-500">
          {title}
        </div>
      )}

      {value && (
        <div className="text-2xl font-bold text-slate-900">
          {value}
        </div>
      )}

      {description && (
        <div className="mt-1 text-sm text-slate-500">
          {description}
        </div>
      )}

      {children}
    </div>
  );
}
