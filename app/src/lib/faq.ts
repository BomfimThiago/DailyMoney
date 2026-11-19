// The FAQ (Dúvidas): how credit cards work in Daily Money. Plain text, one answer per
// question; paragraphs split on blank lines.

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const CARD_FAQ: FaqItem[] = [
  {
    id: 'compra',
    question: 'Quando uma compra no cartão conta como gasto?',
    answer:
      'No dia em que você comprou, na categoria da compra. Um mercado pago no cartão em 20 de outubro conta em outubro, em Mercado, mesmo que a fatura só seja paga em novembro.\n\nAssim o Início mostra quanto você gastou de verdade em cada mês, e não quanto saiu da conta.',
  },
  {
    id: 'fatura',
    question: 'Por que pagar a fatura não conta como gasto?',
    answer:
      'Porque as compras já contaram. Quando você paga a fatura, o dinheiro só sai da conta corrente e vai para o cartão. Se o pagamento também contasse, cada compra entraria duas vezes nos Gastos.\n\nPor isso o pagamento ganha a categoria Pago de Cartão de Crédito e fica fora dos Gastos, junto das transferências internas. Você continua vendo a linha, e ela diz para que o dinheiro foi usado.',
  },
  {
    id: 'onde',
    question: 'Onde vejo os pagamentos de fatura?',
    answer:
      'Em Transações, ligue "Transferências internas": os pagamentos aparecem com a categoria Pago de Cartão de Crédito. Na página Cartões, cada fatura mostra quanto foi pago e se ficou faltando algo.',
  },
  {
    id: 'sozinho',
    question: 'O app reconhece o pagamento sozinho?',
    answer:
      'Na maioria das vezes, sim. O app reconhece quando o banco diz que é pagamento de fatura, quando a descrição fala em fatura ou cartão ("Pagamento de fatura") e quando a saída da conta bate com o crédito que chegou no cartão.\n\nSe algum escapar, abra a transação e escolha "Pago de cartão" em "Esta linha é".',
  },
  {
    id: 'meio-do-mes',
    question: 'E se o cartão fecha no meio do mês?',
    answer:
      'A fatura junta compras de dois meses, por exemplo de 25 de outubro a 24 de novembro. Não tem problema: cada compra conta no mês em que foi feita, então outubro fica com as compras de outubro e novembro com as de novembro.\n\nO total da fatura, como o banco cobra, aparece na página Cartões.',
  },
  {
    id: 'fora',
    question: 'E se o cartão não estiver no app?',
    answer:
      'Se o cartão não está conectado e você não enviou a fatura dele, as compras não aparecem em lugar nenhum. Aí o pagamento é o único registro desse dinheiro, e o app conta o pagamento como gasto (com a categoria Pago de Cartão de Crédito), para o mês não parecer mais barato do que foi.\n\nO app considera que o cartão está no app quando existe um cartão do mesmo banco, ou quando o pagamento bate com o crédito no cartão. Quando você conectar o cartão ou enviar a fatura, as compras passam a contar e o pagamento sai dos Gastos sozinho.',
  },
];
