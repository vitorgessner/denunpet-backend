// Validação de CPF e CNPJ pelos dígitos verificadores.
// A mesma lógica existe no frontend em src/lib/document.ts

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

// Soma ponderada dos dígitos; `weights` tem o peso de cada posição
function checkDigit(digits: string, weights: number[]) {
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  // Sequências como 111.111.111-11 passam na conta, mas não são CPFs válidos
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  const first = checkDigit(cpf, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(cpf, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);

  return first === Number(cpf[9]) && second === Number(cpf[10]);
}

export function isValidCnpj(value: string) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;

  const first = checkDigit(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return first === Number(cnpj[12]) && second === Number(cnpj[13]);
}
