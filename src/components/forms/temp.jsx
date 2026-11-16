;<div className="flex items-start gap-5">
  <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
    <Icon className="w-8 h-8 text-emerald-700" />
  </div>

  <div>
    <h3 className="font-bold text-xl">{title}</h3>

    {description && <p className="text-slate-500 mt-1">{description}</p>}
  </div>
</div>
