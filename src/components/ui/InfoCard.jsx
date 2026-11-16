import { BadgeCheck } from 'lucide-react'
import StatusBadge from '../lists/StatusBadge'

function InfoCard({
  title,
  subtitle,
  detail,
  status,
  Icon,
  iconBg,
  iconColor = 'text-emerald-600',
}) {
  return (
    <div
      className="
        bg-white
        rounded-xl
        border
        p-5
        hover:shadow-lg
        transition-all
        bg-[#f5f3f985]
      "
    >
      <div className="flex gap-4">
        {iconBg && (
          <div
            className={`
            w-16 h-16
            rounded-full
            flex
            items-center
            justify-center
            ${iconBg}
          `}
          >
            {Icon && <Icon size={30} className={iconColor} />}
          </div>
        )}

        <div className="flex-1">
          <h3 className="font-bold text-lg">{title}</h3>

          {subtitle && <p className="text-gray-700">{subtitle}</p>}

          {detail && (
            <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
              <BadgeCheck size={16} />
              <span>{detail}</span>
            </div>
          )}

          {status && (
            <div className="mt-3">
              <StatusBadge status={status} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default InfoCard
