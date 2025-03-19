$(document).ready(function () {
  // Listen for the navbar collapse show event
  $('#navbarSupportedContent1').on('show.bs.collapse', function () {
      // Add margin-top to the heading
      $('.headingMainColorful').css('margin-top', '300px');
  });

  // Listen for the navbar collapse hide event
  $('#navbarSupportedContent1').on('hide.bs.collapse', function () {
      // Remove the margin-top from the heading
      $('.headingMainColorful').css('margin-top', '');
  });
});