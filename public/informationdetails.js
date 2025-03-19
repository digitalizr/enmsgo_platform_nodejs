document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("informationForm");

  form.addEventListener("submit", (e) => {
    e.preventDefault(); // Prevent form submission

    // Clear previous error messages
    clearErrors();

    // Validate all fields
    const isFullNameValid = validateField("fullName", "Full Name is required");
    const isContactInfoValid = validateField(
      "contactInfo",
      "Contact Information is required"
    );
    const isEmailValid = validateEmail("email", "Enter a valid email address");
    const isStreetNameValid = validateField(
      "streetName",
      "Street Name is required"
    );
    const isBuildingNumberValid = validateField(
      "buildingNumber",
      "Building Number is required"
    );
    const isZipCodeValid = validateField("zipCode", "Zip Code is required");
    const isEntranceCodeValid = validateField(
      "entranceCode",
      "Entrance Code is required"
    );
    const isFloorValid = validateField("floor", "Floor is required");
    const isApartmentValid = validateField(
      "apartment",
      "Apartment is required"
    );

    // If all fields are valid, pass data to the next page
    if (
      isFullNameValid &&
      isContactInfoValid &&
      isEmailValid &&
      isStreetNameValid &&
      isBuildingNumberValid &&
      isZipCodeValid &&
      isEntranceCodeValid &&
      isFloorValid &&
      isApartmentValid
    ) {
      // Get form data
      const formData = new URLSearchParams(new FormData(form)).toString();

      // Redirect to next page with form data
      window.location.href = `orderandpayment.html?${formData}`;
    }
  });

  // Function to validate a field
  function validateField(fieldId, errorMessage) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}Error`);

    if (!field.value.trim()) {
      errorElement.textContent = errorMessage;
      errorElement.style.display = "block";
      return false;
    }
    return true;
  }

  // Function to validate email
  function validateEmail(fieldId, errorMessage) {
    const field = document.getElementById(fieldId);
    const errorElement = document.getElementById(`${fieldId}Error`);
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!field.value.trim()) {
      errorElement.textContent = "Email Address is required";
      errorElement.style.display = "block";
      return false;
    } else if (!emailPattern.test(field.value)) {
      errorElement.textContent = errorMessage;
      errorElement.style.display = "block";
      return false;
    }
    return true;
  }

  // Function to clear all error messages
  function clearErrors() {
    const errorMessages = document.querySelectorAll(".error-message");
    errorMessages.forEach((error) => {
      error.textContent = "";
      error.style.display = "none";
    });
  }
});
