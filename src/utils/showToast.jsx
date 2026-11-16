import toast from 'react-hot-toast'
import { Check, X, AlertTriangle, Flame } from 'lucide-react'

export const showToast = ({ type = 'success', message }) => {
  const styles = {
    success: {
      bg: 'bg-green-100',
      bar: 'bg-green-500',
      text: 'text-green-800',
      icon: <Check />,
    },
    error: {
      bg: 'bg-red-100',
      bar: 'bg-red-500',
      text: 'text-red-800',
      icon: <Flame />,
    },
    warning: {
      bg: 'bg-yellow-100',
      bar: 'bg-yellow-500',
      text: 'text-yellow-800',
      icon: <AlertTriangle />,
    },
  }

  const s = styles[type]

  toast.custom((t) => (
    <div
      className={`flex items-center min-w-max rounded-lg shadow-lg overflow-hidden min-h-max ${s.bg}`}
    >
      <div className={`${s.bar} p-6 text-white`}>{s.icon}</div>

      <div className={`flex-1 px-4 py-3 text-sm ${s.text}`}>{message}</div>

      <button onClick={() => toast.dismiss(t.id)} className="p-3">
        <X className="w-4 h-4" />
      </button>
    </div>
  ))
}
