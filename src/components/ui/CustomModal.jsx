import { usePresencia } from '../../hooks/usePresencia'
import Button from './Button'
import { AlertTriangle, Info, CheckCircle } from 'lucide-react'

function CustomModal({
  children,
  show,
  title = 'Confirma esta acción',
  message,
  icon: Icon,
  buttonSize = 'full',
  variant = 'warning', // warning | danger | success | info
  confirmLabel = 'Enviar',
  onClose,
  onConfirm,
}) {
  const { montado, saliendo } = usePresencia(show, 170)
  if (!montado) {
    return null
  }

  const style = getModalVariant(variant)

  //const style = styles[type]
  const VariantIcon = style.icon

  return (
    <div className={`mac-fondo ${saliendo ? 'saliendo' : ''} fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center`}>
      <div
        className={`
          mac-ventana ${saliendo ? 'saliendo' : ''}
          bg-white
          rounded-2xl
          overflow-hidden
          w-full
          max-w-3xl
          border
          ${style.border}
        `}
      >
        <div
          className="
            max-h-[90vh]
            overflow-y-auto
            p-8
          "
        >
          {/* ICON */}
          <div className="flex justify-start gap-8">
            <div className="flex justify-center mb-4">
              {Icon && <Icon className={`w-10 h-10 ${style.iconColor}`} />}
              {!Icon && <VariantIcon className={`w-10 h-10 ${style.iconColor}`} />}
            </div>

            {/* TITLE */}
            <h2 className="text-xl font-semibold mb-2">{`${title}`}</h2>
          </div>
          {/* MESSAGE */}
          {message && <p className={`text-gray-600 mb-4 text-lg stify-center`}>{message}</p>}
          {/* CUSTOM CONTENT */}

          {children && <div className="my-4 max-h-[90vh] ">{children}</div>}

          <hr className={`border-t-2 ${style.border} mb-4`} />
          {/* ACTIONS */}
          <div className={'flex justify-center gap-4'}>
            {onClose && (
              <Button label="Cancelar" onClick={onClose} variant="secondary" tamano={buttonSize} />
            )}
            {/** warning | danger | success | info
          const variants = {
            primary: "bg-green-600 text-white hover:bg-green-700",
            secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300",
            danger: "bg-red-600 text-white hover:bg-red-700",
            warning: "bg-yellow-600 text-white hover:bg-yellow-700",
          }; */}
            {onConfirm && (
              <Button
                label={confirmLabel}
                onClick={onConfirm}
                variant={style.buttonVariant}
                tamano={buttonSize}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
const getModalVariant = (variant) => {
  switch (variant) {
    case 'danger':
      return {
        icon: AlertTriangle,
        border: 'border-red-300',
        iconColor: 'text-red-600',
        buttonVariant: 'danger',
      }
    case 'warning':
      return {
        icon: AlertTriangle,
        border: 'border-orange-300',
        iconColor: 'text-orange-600',
        buttonVariant: 'warning',
      }
    case 'success':
      return {
        icon: CheckCircle,
        border: 'border-green-300',
        iconColor: 'text-green-600',
        buttonVariant: 'primary',
      }
    default:
      return {
        icon: Info,
        iconColor: 'text-blue-600',
        border: 'border-green-300',
        buttonVariant: 'primary',
      }
  }
}

export default CustomModal
