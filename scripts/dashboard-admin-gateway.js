// Dashboard Admin Gateway
// Handles the admin chooser modal functionality

document.addEventListener('DOMContentLoaded', () => {
    const adminCard = document.getElementById('adminCard');
    const chooser = document.getElementById('adminChooser');
    const closeBtn = document.getElementById('adminChooserClose');

    if (adminCard && chooser) {
        adminCard.addEventListener('click', (e) => {
            e.preventDefault();
            chooser.classList.add('show'); // add basic CSS to show modal
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => chooser.classList.remove('show'));
    }

    // Close modal when clicking outside
    if (chooser) {
        chooser.addEventListener('click', (e) => {
            if (e.target === chooser) {
                chooser.classList.remove('show');
            }
        });
    }
});
