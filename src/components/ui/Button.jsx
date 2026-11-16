import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'

function Button({
  label,
  onClick,
  to,
  tamano = 'medium',
  type = 'button',
  variant = 'primary',
  loading = false,
  disabled = false,
  icon: Icon = null,
  rightIcon: RightIcon = null,
  toggle,
  name,
  isOpen,
  children,
}) {
  const navigate = useNavigate()

  //const base = 'flex items-center justify-center p-4 min-w-0'
  const base =
    'flex items-center justify-center py-2.5 px-4 min-w-0 font-medium text-sm transition-all duration-300 ease-out select-none'
  // warning | danger | success | info
  const variants = {
    primary: 'bg-green-600 text-white  hover:bg-green-700',
    secondary: 'bg-gray-300 text-gray-800 hover:bg-gray-400',
    outline: 'border border-emerald-600 text-emerald-600 hover:bg-emerald-50',

    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'bg-red-600/80 text-white hover:bg-red-700',
    warning: 'bg-yellow-600 text-white hover:bg-yellow-700',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600',
  }

  const handleClick = () => {
    if (disabled || loading) {
      return
    }

    if (toggle && name) {
      toggle(name)
    } else if (to) {
      navigate(to)
    } else if (onClick) {
      onClick()
    }
  }

  return (
    <button
      onClick={handleClick}
      type={type}
      disabled={disabled || loading}
      className={`
        ${base}
        ${variants[variant] || variant}
        ${tamano === 'full' ? 'w-full' : ''}
        ${tamano === 'small' ? 'xl:min-w-36' : ''}
        ${tamano === 'medium' ? ' xl:min-w-40' : ''}
        ${tamano === 'large' ? 'sm:w-full xl:min-w-60' : ''}
        ${tamano === 'extralarge' ? 'w-full' : ''}
        ${tamano === 'icon' ? 'w-10 h-10 p-0 border-2' : ''}
        rounded-2xl
        ${disabled ? 'hover:scale-100 ' : 'transform transition-all duration-300 ease-out hover:scale-105 '}
        ${disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {/* LEFT */}
      <div className="flex items-center gap-3">
        {Icon && <Icon className="w-5 h-5" />}
        {label && <span>{loading ? 'Procesando...' : label}</span>}
      </div>

      {/* RIGHT */}
      {RightIcon && <RightIcon className="w-4 h-4" />}

      {/* TOGGLE ICON */}
      {toggle && (
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      )}
      {children}
    </button>
  )
}

export default Button
