export function applyMask(value, mask) {
  if (!value) {return value}
  switch (mask) {
  // TELÉFONO (4101-5576)
  case 'phone': {
    const digits = value.replace(/\D/g, '').slice(0, 8)
    if (digits.length <= 4) {return digits}
    return digits.slice(0, 4) + '-' + digits.slice(4)
  }

  // TELÉFONO INTERNACIONAL (+502 4101-5576)
  case 'phone-int': {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 3) {return '+' + digits}
    if (digits.length <= 7)
    {return '+' + digits.slice(0, 3) + ' ' + digits.slice(3)}
    return (
      '+' +
        digits.slice(0, 3) +
        ' ' +
        digits.slice(3, 7) +
        '-' +
        digits.slice(7)
    )
  }

  //  MONEDA (Q 99,999.99)
  case 'money': {
    const valRaw = value.replace(/^Q\.\s?/, '')
    //const num = value.replace(/[^\d]/g, "").slice(0, 9);
    //return num ? "Q " + Number(num).toLocaleString("es-GT") : "";
    // Dejar solo dígitos y punto
    const val = valRaw.replace(/[^0-9.]/g, '').slice(0, 11)
    // Solo un punto decimal
    const parts = val.split('.')
    let intPart = parts[0] || ''
    let decPart = parts.length > 1 ? parts[1].slice(0, 2) : ''
    // Quitar ceros iniciales
    intPart = intPart.replace(/^0+(\d)/, '$1') || ''
    // Separador de miles
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.length > 1 ? `Q. ${intPart}.${decPart}` : `Q. ${intPart}`
  }

  //  NÚMERO SIN FORMATO
  case 'number':
    return value.replace(/[^\d]/g, '')

    // EMAIL (minúsculas)
  case 'email':
    return value.toLowerCase()

    //  DPI (9999 99999 9999)
  case 'dpi': {
    const digits = value.replace(/\D/g, '').slice(0, 13)
    if (digits.length <= 4) {return digits}
    if (digits.length <= 9) {return digits.slice(0, 4) + ' ' + digits.slice(4)}
    return (
      digits.slice(0, 4) + ' ' + digits.slice(4, 9) + ' ' + digits.slice(9)
    )
  }

  //  NIT (1234567-8)
  case 'nit': {
    const digits = value.replace(/\D/g, '').slice(0, 9)
    if (digits.length <= 7) {return digits}
    return digits.slice(0, 7) + '-' + digits.slice(7)
  }

  //  FECHA (dd/mm/yyyy)
  case 'date': {
    const digits = value.replace(/\D/g, '').slice(0, 8)
    if (digits.length <= 2) {return digits}
    if (digits.length <= 4) {return digits.slice(0, 2) + '/' + digits.slice(2)}
    return (
      digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4)
    )
  }

  //  TARJETA (xxxx xxxx xxxx xxxx)
  case 'card': {
    const digits = value.replace(/\D/g, '').slice(0, 16)
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
  }

  //  CUENTA BANCARIA (ejemplo 10-12 dígitos)
  case 'account':
    return value.replace(/\D/g, '').slice(0, 12)

    //  SOLO LETRAS
  case 'text':
    return value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '')

    //  ALFANUMÉRICO
  case 'alphanumeric':
    return value.replace(/[^a-zA-Z0-9]/g, '')

  default:
    return value
  }
}
export function validateByMask(value, mask) {
  if (!value) {return false}

  const digits = value.replace(/\D/g, '')

  switch (mask) {
  case 'dpi':
    return digits.length === 13

  case 'phone':
    return digits.length === 8
    /*
    case "phone-int":
      return digits.length >= 11;

    case "nit":
      return digits.length >= 8;

    case "card":
      return digits.length === 16;

    case "account":
      return digits.length >= 10;

    case "date":
      return digits.length === 8;

    case "money":
      return digits.length > 0;*/

  default:
    return true
  }
}
