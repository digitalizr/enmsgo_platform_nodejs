#To build the Docker Image us ethis command:

docker build -t digitalizr/node_backend .   

#After a szccessful build , push it the Docker hub:

docker push  digitalizr/node_backend:latest 


📥 Installation Guide


1️⃣ Clone the Repository
First, pull the project from GitHub:

# git clone https://github.com/digitalizr/enmsgo_platform_nodejs.git

Or, if you already have it and need the latest updates:

# git pull origin main

Navigate into the project folder:

# cd YOUR_REPOSITORY_NAME


2️⃣ Install Dependencies
Make sure you have Node.js installed. Then, install the required dependencies:

# npm install

3️⃣ Configure Environment Variables
Create a .env file in the root directory and add your PostgreSQL credentials:


# PORT = e.g 3000

# DB_USER=your_database_user
# DB_HOST=your_database_host
# DB_NAME=your_database_name
# DB_PASSWORD=your_database_password
# DB_PORT=your_database_port


4️⃣ Set Up the Database
Ensure your PostgreSQL database is running. 


5️⃣ Start the Server
Run the application:

# npm start




 
# API Endpoints Documentation 📌

# User Routes (/api/users)

Method	 =>    Endpoint	  =>      Description
POST	=>      /api/users	 =>      Add a new user
GET	 =>      /api/users	  =>     Get all users
GET	 =>      /api/users/:id	=>   Get a single user by ID
PUT	 =>      /api/users/:id	=>   Update a user by ID
DELETE	=>    /api/users/:id	 =>  Delete a user by ID


# Company Routes (/api/companies)


Method	 =>         Endpoint	     =>               Description
POST =>	           /api/companies/register=>      Register a new company
GET	 =>            /api/companies	        =>      Get all companies
GET	 =>            /api/companies/:id	    =>      Get a company by ID
PUT	 =>            /api/companies/:id	    =>      Update a company by ID
DELETE	=>          /api/companies/:id	    =>      Delete a company by ID


# Smart Meter Routes (/api/smart-meters)

Method	=>             Endpoint	   =>                 Description
POST	  =>             /api/smart-meters	       =>    Add a new smart meter
GET	   =>             /api/smart-meters	       =>    Get all smart meters
GET	   =>             /api/smart-meters/:id	   =>    Get a smart meter by ID
PUT	   =>             /api/smart-meters/:id	   =>    Update a smart meter by ID
DELETE	=>             /api/smart-meters/:id	   =>    Delete a smart meter by ID
