import Button from '../ui/Button'
import { useState } from 'react'
import { ChevronDown, CheckCircle2 } from 'lucide-react'

function FormGroupField({
  title,
  children,
  icon: Icon = null,
  classNameIcon,
  completed = false,
  defaultOpen = false,
  description,
  type = 'default',
  className,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return title === '' ? (
    <div>{children}</div>
  ) : (
    <div
      className={`${type === 'card' ? 'flex flex-row ' : 'flex flex-col '}border border-border rounded-xl overflow-hidden hover:shadow-xl hover:-translate-y-1`}
    >
      {type === 'card' ? (
        <div
          className={`flex flex-col items-center justify-center w-72 shrink-0 p-6 ${className ?? 'border-r bg-slate-50 gap-5 m-2'}`}
        >
          <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center">
            <Icon className={`${classNameIcon ?? 'w-8 h-8'} `} />
          </div>

          <div>
            <h3 className="font-bold text-lg">{title}</h3>

            {description && <p className="text-slate-500 mt-1">{description}</p>}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`${className ?? 'border-b border-border bg-[#00502f0e] bg-primary/5 hover:bg-slate-50'}  px-5 py-5 items-start gap-2  w-full hover:scale-100 flex justify-between  transition-colors`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className=" flex  items-start gap-4">
            {Icon && (
              <div className="w-11 h-11 rounded-full bg-emerald-50 flex items-center justify-center">
                <Icon className="w-5 h-5 text-emerald-600" />
              </div>
            )}
            {/* TITULO */}
            <div className="text-left">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-xl text-slate-800">{title}</h3>
                {completed && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              </div>
              {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
            </div>
          </div>
          <ChevronDown
            className={` w-5 h-5text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      )}
      {/* BODY */}
      <div
        className={`${type === 'card' ? 'flex-1 ' : ''} transition-all duration-300 overflow-hidden ${isOpen ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  )
}
export default FormGroupField
