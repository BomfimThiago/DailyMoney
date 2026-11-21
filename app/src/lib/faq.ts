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
    question: 'Em que mês uma compra no cartão conta como saída?',
    answer:
      'No mês em que a fatura vence, que é quando o dinheiro sai da conta. A compra continua na categoria dela. Um mercado de 20 de outubro, num cartão que fecha no dia 3 e vence no dia 10, conta em 10 de novembro, em Mercado.\n\nAssim a saída do mês é o dinheiro que saiu de verdade, e você continua vendo onde ele foi gasto.\n\nPara isso o app precisa saber o dia de fechamento e o dia de vencimento de cada cartão. Você informa em Ajustes › Compras no cartão de crédito. Sem os dois dias, as compras daquele cartão contam no dia da compra.',
  },
  {
    id: 'escolha',
    question: 'Posso contar as compras no dia em que comprei?',
    answer:
      'Pode. Em Ajustes › Compras no cartão de crédito, escolha "No dia da compra". Aí cada compra conta no dia em que foi feita, mesmo que a fatura venha no mês seguinte. Esse jeito mostra quanto você gastou em cada mês, e não quanto saiu da conta.\n\nVocê pode trocar quando quiser: todas as telas mudam juntas.',
  },
  {
    id: 'fatura',
    question: 'Por que o pagamento da fatura não aparece nas saídas?',
    answer:
      'Porque o valor dele já está nas saídas: são as compras da fatura, cada uma na sua categoria. Se o pagamento também contasse, cada compra entraria duas vezes.\n\nPor isso o pagamento ganha a categoria Pago de Cartão de Crédito e fica fora das saídas, junto das transferências internas. Você continua vendo a linha, e ela diz para que o dinheiro foi usado.',
  },
  {
    id: 'data',
    question: 'Por que uma compra aparece num mês diferente da data dela?',
    answer:
      'Porque conta no mês da fatura. Em Transações, a linha mostra a data da compra e, ao lado, o dia em que ela conta ("conta em 10 nov"). O calendário de gastos e as análises por dia também usam o dia do vencimento.',
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
      'A fatura junta compras de dois meses, por exemplo de 25 de outubro a 24 de novembro. Não tem problema: todas contam juntas no mês em que a fatura vence, como o dinheiro sai da conta. Se você escolheu contar pelo dia da compra, outubro fica com as compras de outubro e novembro com as de novembro.\n\nO total da fatura, como o banco cobra, aparece na página Cartões.',
  },
  {
    id: 'fora',
    question: 'E se o cartão não estiver no app?',
    answer:
      'Se o cartão não está conectado e você não enviou a fatura dele, as compras não aparecem em lugar nenhum. Aí o pagamento é o único registro desse dinheiro, e o app conta o pagamento como saída (com a categoria Pago de Cartão de Crédito), para o mês não parecer mais barato do que foi.\n\nO app considera que o cartão está no app quando existe um cartão do mesmo banco, ou quando o pagamento bate com o crédito no cartão. Quando você conectar o cartão ou enviar a fatura, as compras passam a contar e o pagamento sai das saídas sozinho.',
  },
];
