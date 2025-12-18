
Servers:
	- When creating a new server:
		The "Advanced Configuration"
		"Show additional options" button is visible.
		Clicking on this button does not open any additional configuration options.
		The server cannot be created using Advanced Configuration.
        - Server can be created and delete.
	- In CPU its show nothing for adding component.
	- CPU and other hardware components cannot be configured or added after server creation.
	- Only one component can be added at a time.
	- When attempting to add another component, the system throws an error and the component is not added.
	- Advanced View button not working.

HBA Cards
	When creating an HBA Card using the "Add Component" button:

        1. The component creation form opens and all required details can be filled.
       	2. After submission, the system opens the "Selected Component Details" section with the following fields:
   		- Model
   		- Interface
   		- Protocol
   		- Data Rate
   		- Internal Ports
   		- External Ports
   		- Max Devices

	3. These fields are displayed but are not selectable or editable.
	4. The "Component UUID" field is auto-filled from the component selection and cannot be edited during creation.
	5. After the component is created, the Component UUID becomes editable and can be updated.
	6. On update, the system creates duplicate entries for the same component.
	7. Both a success and error message are displayed simultaneously:
   		- "Success: Component updated successfully!"
   		- "Error: An error occurred while updating the component."
	8. HBA can be edit and delete 
	9. The following fields do not display any status or validation, whether they are filled or left empty:

		- Location
		- Rack Position
		- Purchase Date
		- Installation Date
		- Warranty End Date


PCIe Cards
	When creating an PCIe Card using the "Add Component" button:

	1. The component creation form opens and all required details can be filled.
	2. After submission, the system opens the "Selected Component Details" section with the following fields:
   		- Model
		-Interface
		-M.2 Slots
		-Form Factors
		-Max Capacity
		-Power


	3. These fields are displayed but are not selectable or editable.
	4. The "Component UUID" field is auto-filled from the component selection and cannot be edited during creation.
	5. After the component is created, the Component UUID becomes editable and can be updated.
	6. PCIe Card can be edit and delete 
	7. The following fields do not display any status or validation, whether they are filled or left empty:

		- Location
		- Rack Position
		- Purchase Date
		- Installation Date
		- Warranty End Date


Chassis 
	When creating an Chassis using the "Add Component" button:

        1. The component creation form opens and all required details can be filled.
       	2. After submission, the system opens the "Selected Component Details" section with the following fields:
   		- Model
   		- Form Factor
   		- U Size
   		- Type
   		- Total Bays	
		- Backplane	
		- PSU Wattage

	3. These fields are displayed but are not selectable or editable.
	4. The "Component UUID" field is auto-filled from the component selection and cannot be edited during creation.
	5. After the component is created, the Component UUID becomes editable and can be updated.
	6. On update, the system creates duplicate entries for the same component.
	7. Both a success and error message are displayed simultaneously:
   		- "Success: Component updated successfully!"
   		- "Error: An error occurred while updating the component."
	8. Chassis can be edit and delete 
	9. The following fields do not display any status or validation, whether they are filled or left empty:

		- Location
		- Rack Position
		- Purchase Date
		- Installation Date
		- Warranty End Date

CADDY
	When clicking on "Add Component" for CADDY:

	- The component creation page opens successfully.
	- When selecting Field 1, no options are displayed.
	- Because Field 1 shows no data, all dependent fields remain disabled or empty.
	- As a result, none of the fields can be filled and the component cannot be created.


CPUs
	1. The Refresh button in the CPUs section is not working.
	2. CPU creation works successfully.
	3. When editing an existing CPU:
	   - The update action is performed.
	   - Both messages are displayed at the same time:
	     • "Component updated successfully!"
	     • "Error: An error occurred while updating the component."
	4. CPU deletion works normally without issues.


RAM
	1. RAM creation works successfully.
	2. When editing an existing RAM:
	   - The update action is performed.
	   - Both messages are displayed at the same time:
	     • "Component updated successfully!"
	     • "Error: An error occurred while updating the component."
	3. RAM deletion works normally without issues.


Storage
	1. The Refresh button in the Storage section is not working.
	2. Storage creation works successfully.
	3. When editing an existing Storage:
	   - The update action is performed.
	   - Both messages are displayed at the same time:
	     • "Component updated successfully!"
	     • "Error: An error occurred while updating the component."
	4. Storage deletion works normally without issues.


Motherboards
	1. Motherboards creation works successfully.
	2. When editing an existing Motherboards:
	   - The update action is performed.
	   - Both messages are displayed at the same time:
	     • "Component updated successfully!"
	     • "Error: An error occurred while updating the component."
	3. Motherboards deletion works normally without issues.


Network Cards
	1. Network Cards creation works successfully.
	2. When editing an existing Network Cards:
	   - The update action is performed.
	   - Both messages are displayed at the same time:
	     • "Component updated successfully!"
	     • "Error: An error occurred while updating the component."
	3. Network Cards deletion works normally without issues.



Ui 
	-Selected Component Details not show in dark mode.
	-MANUFACTURER All AMD Intel these button show error in ui in Light mode.

	-The following fields do not show any validation or error message,
	 whether they are filled or left empty:

	 Date Information:
	 - Purchase Date (dd-mm-yyyy)
	 - Installation Date (dd-mm-yyyy)
	 - Warranty End Date (dd-mm-yyyy)

	 Additional Information:
	 - Flag (No Flag)
	 - Notes (Additional notes, specifications, or remarks)

