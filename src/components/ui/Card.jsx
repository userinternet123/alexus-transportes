function Card({ icon: Icon, label, valor, color = 'orange', onClick }) {
  const styles = {
    green: {
      border: 'border-green-300',
      bg: 'bg-green-50',
      text: 'text-green-700',
      icon: 'text-green-600',
    },
    blue: {
      border: 'border-blue-300',
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      icon: 'text-blue-600',
    },
    red: {
      border: 'border-red-300',
      bg: 'bg-red-50',
      text: 'text-red-700',
      icon: 'text-red-600',
    },
    purple: {
      border: 'border-purple-300',
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      icon: 'text-purple-600',
    },
    pink: {
      border: 'border-pink-300',
      bg: 'bg-pink-50',
      text: 'text-pink-700',
      icon: 'text-pink-600',
    },
    yellow: {
      border: 'border-yellow-300',
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      icon: 'text-yellow-600',
    },
    teal: {
      border: 'border-teal-300',
      bg: 'bg-teal-50',
      text: 'text-teal-700',
      icon: 'text-teal-600',
    },
    indigo: {
      border: 'border-indigo-300',
      bg: 'bg-indigo-50',
      text: 'text-indigo-700',
      icon: 'text-indigo-600',
    },
    cyan: {
      border: 'border-cyan-300',
      bg: 'bg-cyan-50',
      text: 'text-cyan-700',
      icon: 'text-cyan-600',
    },
    orange: {
      border: 'border-orange-300',
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      icon: 'text-orange-600',
    },
    emerald: {
      border: 'border-emerald-300',
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      icon: 'text-emerald-600',
    },
  }
  const style = styles[color]

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-center gap-2 p-5 xl:size-full xl:h-full border rounded-xl ${style?.border} ${style?.bg} transform transition duration-500 ease-in-out active:scale-95 ${onClick ? 'cursor-pointer hover:scale-110 hover:shadow-md hover:-translate-y-1' : ''}`}
    >
      {Icon && <Icon className={`w-8 h-8 ${style?.icon}`} />}
      <div>
        <b className={`text-2xl  ${style?.text}`}>{valor}</b>
        <p className="text-gray-600">{label}</p>
      </div>
    </div>
  )
}

export default Card
