import { useOutletContext } from 'react-router-dom'

import FormBase from '../components/forms/FormBase'
import ListadoSolicitudes from '../components/lists/ListadoSolicitudes'

function DynamicPage() {
  /*TEST ASIGNACIÓN */

  const { type, config } = useOutletContext()
  const handleAction = (action, row) => {}

  if (type === 'list') {
    return <ListadoSolicitudes config={config} onAction={handleAction} />
  }

  return <FormBase />
}

export default DynamicPage
