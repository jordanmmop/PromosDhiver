const title = document.getElementById('paymentTitle');
const message = document.getElementById('paymentMessage');
const sessionId = new URLSearchParams(window.location.search).get('session_id');

if (!sessionId) {
  title.textContent = 'Commande introuvable';
  message.textContent = 'Aucune session de paiement n’a été fournie. Vous pouvez revenir à la boutique.';
} else {
  fetch(`/api/checkout-session/${encodeURIComponent(sessionId)}`)
    .then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      return result;
    })
    .then(result => {
      if (result.paymentStatus === 'paid') {
        title.textContent = 'Merci pour votre commande';
        message.textContent = 'Votre paiement est confirmé. Vous recevrez les informations de suivi dès que la commande sera expédiée.';
      } else {
        title.textContent = 'Paiement en cours';
        message.textContent = 'Stripe n’a pas encore confirmé le paiement. Revenez ici dans un instant pour vérifier son statut.';
      }
    })
    .catch(() => {
      title.textContent = 'Statut indisponible';
      message.textContent = 'Nous n’avons pas pu vérifier le paiement pour le moment. Si le montant a été débité, contactez-nous avant de recommencer votre commande.';
    });
}
