import { ChevronDown } from 'lucide-react'
import { Children } from 'react'
import { useNavigate } from 'react-router-dom'

function MenuItem({
  icon: Icon,
  label,
  name,
  openMenu,
  toggle,
  children,
  onClick,
  className,
}) {
  const isOpen = openMenu === name
  const navigate = useNavigate()
  const hasChildren = Children.count(children) > 0

  const handleClick = () => {
    if (onClick) {
      onClick()
    }
    if (hasChildren) {
      toggle(name)
    }
  }

  return (
    <div>
      {/* BOTÓN */}
      <button
        onClick={handleClick}
        className={`${className ? className : 'menu-item menu-toggle-option w-full flex font-medium items-center justify-between'}`}
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className="w-5 h-5" />}
          <span>{label}</span>
        </div>

        {children && (
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        )}
      </button>

      {/* SUBMENU */}
      {children && (
        <div className={`ml-9 mt-2 ${isOpen ? 'block' : 'hidden'}`}>
          {children}
        </div>
      )}
    </div>
  )
}

export default MenuItem
