import { Check } from 'lucide-react'

function StepProgress({ config, form, shouldShowField }) {
  const groups = config
    .filter((section) => section.subgrupo !== '')
    .map((section) => {
      const requiredFields = section.fields.filter((field) => {
        if (!field.required) return false

        if (
          field.type === 'button' ||
          field.type === 'space' ||
          field.type === 'separator' ||
          field.type === 'label'
        ) {
          return false
        }

        return shouldShowField(field, form)
      })

      const completedFields = requiredFields.filter((field) => {
        const value = form[field.name]

        return value !== undefined && value !== null && String(value).trim() !== ''
      })

      return {
        title: section.subgrupo,
        total: requiredFields.length,
        completed: completedFields.length,
        done: requiredFields.length > 0 && completedFields.length === requiredFields.length,
      }
    })

  const totalRequired = groups.reduce((acc, group) => acc + group.total, 0)

  const completedRequired = groups.reduce((acc, group) => acc + group.completed, 0)

  const progress = totalRequired === 0 ? 0 : Math.round((completedRequired / totalRequired) * 100)

  const currentStep = groups.findIndex((group) => !group.done) + 1

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      {/* PASOS */}

      <div className="flex justify-between items-start relative">
        {groups.map((group, index) => (
          <div key={group.title} className="flex flex-col items-center z-10">
            <div
              className={`
                w-10 h-10
                rounded-full
                flex
                items-center
                justify-center
                font-semibold

                ${
                  group.done
                    ? 'bg-emerald-600 text-white'
                    : 'border-2 border-slate-300 bg-white text-slate-500'
                }
              `}
            >
              {group.done ? <Check size={16} /> : index + 1}
            </div>

            <span
              className={`
                text-xs
                mt-2
                text-center

                ${group.done ? 'text-emerald-700 font-semibold' : 'text-slate-500'}
              `}
            >
              {group.title}
            </span>
          </div>
        ))}

        <div className="absolute left-0 right-0 top-5 h-[2px] bg-slate-200 -z-10" />
      </div>

      {/* PROGRESS BAR */}

      <div className="mt-5">
        <div className="flex justify-between text-sm mb-2">
          <span>
            Paso {currentStep <= 0 ? groups.length : currentStep} de {groups.length}
          </span>

          <span>{progress}%</span>
        </div>

        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 transition-all duration-500"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default StepProgress
