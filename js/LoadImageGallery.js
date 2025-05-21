import { app } from "../../scripts/app.js";
let thumbnailCache = new Map();
// Adds a gallery to the Load Image node and tabs for Load Checkpoint/Lora/etc Nodes

const ext = {
    name: "Comfy.LoadImageGallery",
    async init() {
        const ctxMenu = LiteGraph.ContextMenu;
        const style = document.createElement('style');
style.textContent = `
    .comfy-context-menu-filter {
        grid-area: 1 / 1 / 2 / 5;
    }
    .custom-tabs-container {
        grid-area: 2 / 1 / 3 / 5;
        display: flex;
        align-items: center;
        margin-bottom: 10px;
        overflow-x: auto;
        padding: 5px 0;
    }
    .image-entry {
        width: 80px;
        height: 80px;
        background-size: cover;
        background-position: center;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        font-size: 0!important;
        position: relative;
    }
    .delete-button {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 20px;
        height: 20px;
        background-color: rgba(255, 0, 0, 0.7);
        color: white;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        cursor: pointer;
        font-size: 14px !important;
    }
    .tab-button {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        background-color: rgba(0, 100, 255, 0.7);
        color: white;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        cursor: pointer;
        font-size: 14px !important;
    }
    .tab {
        padding: 5px 10px;
        margin-right: 5px;
        background-color: transparent;
        border: none;
        cursor: pointer;
    }
    .tab:last-child {
        margin-right: 0;
    }
    .tab.active {
        border-bottom: 3px solid #64b5f6;
    }
    .custom-tab {
    }
    .tabs-edit-button {
        background-color: #2a2a2a00;
        border: 0px;
        cursor: pointer;
		position: absolute;
		right: 0;
    }
    .tabs-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: #1a1a1a;
        border-radius: 8px;
        padding: 20px;
        z-index: 10000;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
        width: 400px;
        border: 1px solid #444;
    }
    .tabs-modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 9999;
    }
    .tabs-list {
        margin: 15px 0;
        max-height: 300px;
        overflow-y: auto;
    }
    .tab-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px;
        margin-bottom: 5px;
        background-color: #2a2a2a;
        border-radius: 4px;
        border: 1px solid #444;
    }
    .tab-item-name {
        flex-grow: 1;
        margin-right: 10px;
    }
    .tab-item-actions {
        display: flex;
        gap: 5px;
    }
    .tab-item-button {
        padding: 2px 8px;
        background-color: #333;
        border: 1px solid #444;
        border-radius: 4px;
        color: #ddd;
        cursor: pointer;
    }
    .tab-item-button:hover {
        background-color: #444;
    }
    .tab-item-button.delete {
        background-color: #3a1a1a;
        border-color: #622;
    }
    .tab-item-button.delete:hover {
        background-color: #4a2a2a;
    }
    .new-tab-form {
        display: flex;
        margin-top: 15px;
    }
    .new-tab-input {
        flex-grow: 1;
        padding: 8px;
        background-color: #2a2a2a;
        border: 1px solid #444;
        border-radius: 4px;
        color: white;
        margin-right: 10px;
    }
    .new-tab-button {
        padding: 8px 15px;
        background-color: #1a3a1a;
        border: 1px solid #2a4a2a;
        border-radius: 4px;
        color: #ddd;
        cursor: pointer;
    }
    .new-tab-button:hover {
        background-color: #2a4a2a;
    }
    .modal-buttons {
        display: flex;
        justify-content: flex-end;
        margin-top: 20px;
    }
    .modal-button {
        padding: 8px 15px;
        background-color: #333;
        border: 1px solid #444;
        border-radius: 4px;
        color: #ddd;
        cursor: pointer;
        margin-left: 10px;
    }
    .modal-button:hover {
        background-color: #444;
    }
    .modal-button.primary {
        background-color: #1a3a5a;
        border-color: #2a4a6a;
    }
    .modal-button.primary:hover {
        background-color: #2a4a6a;
    }
    .tab-menu {
        position: absolute;
        background-color: #1a1a1a;
        border-radius: 4px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
        padding: 5px 0;
        z-index: 10000;
        border: 1px solid #444;
    }
    .tab-menu-item {
        padding: 5px 15px;
        cursor: pointer;
        white-space: nowrap;
    }
    .tab-menu-item:hover {
        background-color: #2a2a2a;
    }
    .tab-menu-item.selected {
        background-color: #1a3a5a;
        color: white;
    }
	.tab-button.assigned {
    background-color: rgba(0, 200, 100, 0.7); /* green background */
	}
`;
        document.head.append(style);
        let FirstRun = true;
        let tabsData = { tabs: [], image_tabs: {} };
		
		async function preloadThumbnailsBatch(filenames) {
			if (!window.thumbnailCache) {
				window.thumbnailCache = new Map();
			}
			
			try {
				const response = await fetch('/get_thumbnails_batch', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ filenames }),
				});
				
				if (response.ok) {
					const data = await response.json();
					for (const [filename, dataUrl] of Object.entries(data)) {
						window.thumbnailCache.set(filename, dataUrl);
					}
					console.log(`Preloaded ${Object.keys(data).length} thumbnails`);
				}
			} catch (error) {
				console.error("Error preloading thumbnails batch:", error);
			}
		}
        // Load tab data from the server
        async function loadTabsData() {
            try {
                const response = await fetch('/get_image_tabs');
                if (response.ok) {
                    tabsData = await response.json();
                    return tabsData;
                } else {
                    console.error('Failed to load tabs data');
                    return { tabs: [], image_tabs: {} };
                }
            } catch (error) {
                console.error('Error loading tabs data:', error);
                return { tabs: [], image_tabs: {} };
            }
        }

        // Save tab data to the server
        async function saveTabsData() {
            try {
                const response = await fetch('/save_image_tabs', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(tabsData),
                });
                if (response.ok) {
                    console.log('Tabs data saved successfully');
                    return true;
                } else {
                    console.error('Failed to save tabs data');
                    return false;
                }
            } catch (error) {
                console.error('Error saving tabs data:', error);
                return false;
            }
        }

        // Add an image to a tab
        async function addImageToTab(filename, tabName) {
            try {
                const response = await fetch('/add_image_to_tab', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ filename, tab_name: tabName }),
                });
                if (response.ok) {
                    console.log(`Image ${filename} added to tab ${tabName}`);

                    // Update local data
                    if (!tabsData.image_tabs[filename]) {
                        tabsData.image_tabs[filename] = [];
                    }
                    if (!tabsData.image_tabs[filename].includes(tabName)) {
                        tabsData.image_tabs[filename].push(tabName);
                    }

                    return true;
                } else {
                    console.error(`Failed to add image ${filename} to tab ${tabName}`);
                    return false;
                }
            } catch (error) {
                console.error('Error adding image to tab:', error);
                return false;
            }
        }

        // Remove an image from a tab
        async function removeImageFromTab(filename, tabName) {
            try {
                const response = await fetch('/remove_image_from_tab', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ filename, tab_name: tabName }),
                });
                if (response.ok) {
                    console.log(`Image ${filename} removed from tab ${tabName}`);

                    // Update local data
                    if (tabsData.image_tabs[filename]) {
                        const index = tabsData.image_tabs[filename].indexOf(tabName);
                        if (index !== -1) {
                            tabsData.image_tabs[filename].splice(index, 1);
                        }
                        if (tabsData.image_tabs[filename].length === 0) {
                            delete tabsData.image_tabs[filename];
                        }
                    }

                    return true;
                } else {
                    console.error(`Failed to remove image ${filename} from tab ${tabName}`);
                    return false;
                }
            } catch (error) {
                console.error('Error removing image from tab:', error);
                return false;
            }
        }

        // Clean up stale thumbnails
        function CleanDB(values) {
            fetch('/cleanup_thumbnails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ active_files: values }),
            })
            .then(response => {
                if (response.ok) {
                    console.log("Cleaned up stale thumbnails");
                } else {
                    console.error("Failed to clean up thumbnails");
                }
            })
            .catch(error => {
                console.error("Error during thumbnails cleanup:", error);
            });
            
            FirstRun = false;
        }

        // Delete file and its thumbnail
        async function deleteFile(filename) {
            try {
                const response = await fetch('/delete_file', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ filename }),
                });
                if (response.ok) {
                    console.log(`File ${filename} deleted successfully`);

                    // Remove the file from tabs
                    if (tabsData.image_tabs[filename]) {
                        delete tabsData.image_tabs[filename];
                    }

                    return true;
                } else {
                    console.error(`Failed to delete file ${filename}`);
                    return false;
                }
            } catch (error) {
                console.error('Error deleting file:', error);
                return false;
            }
        }

        // Get thumbnail from server
		async function getThumbnail(filename) {
			// Check cache first
			if (window.thumbnailCache && window.thumbnailCache.has(filename)) {
				return window.thumbnailCache.get(filename);
			}
			
			try {
				// Check if thumbnail exists on server
				const response = await fetch(`/get_thumbnail/${encodeURIComponent(filename)}`);
				if (response.ok) {
					const blob = await response.blob();
					const url = URL.createObjectURL(blob);
					
					// Store in cache
					if (!window.thumbnailCache) {
						window.thumbnailCache = new Map();
					}
					window.thumbnailCache.set(filename, url);
					
					return url;
				}
				return null;
			} catch (error) {
				console.error("Error fetching thumbnail:", error);
				return null;
			}
		}


        // Check if thumbnails service is available
        async function checkThumbnailsService() {
            try {
                const response = await fetch('/check_thumbnails_service');
                return response.ok;
            } catch (error) {
                console.error("Thumbnails service unavailable:", error);
                return false;
            }
        }

        // Initialize thumbnails service
        const thumbnailsServiceAvailable = await checkThumbnailsService();
        if (!thumbnailsServiceAvailable) {
            console.warn("Thumbnails service is not available. Some features may not work properly.");
        }

        await loadTabsData();

        // Function to display the tab editing modal
        function showTabsEditModal(container) {
            // Remove existing modal if it exists
            const existingModal = document.querySelector('.tabs-modal');
            if (existingModal) {
                existingModal.remove();
            }
            const existingBackdrop = document.querySelector('.tabs-modal-backdrop');
            if (existingBackdrop) {
                existingBackdrop.remove();
            }

            // Create modal backdrop
            const backdrop = document.createElement('div');
            backdrop.className = 'tabs-modal-backdrop';
            container.appendChild(backdrop);

            // Create modal
            const modal = document.createElement('div');
            modal.className = 'tabs-modal';

            // Title
            const title = document.createElement('h3');
            title.textContent = 'Manage Tabs';
            title.style.margin = '0 0 15px 0';
            modal.appendChild(title);

            // Tabs list
            const tabsList = document.createElement('div');
            tabsList.className = 'tabs-list';

            // Add existing tabs
            tabsData.tabs.forEach(tabName => {
                const tabItem = document.createElement('div');
                tabItem.className = 'tab-item';

                const tabNameSpan = document.createElement('span');
                tabNameSpan.className = 'tab-item-name';
                tabNameSpan.textContent = tabName;
                tabItem.appendChild(tabNameSpan);

                const tabActions = document.createElement('div');
                tabActions.className = 'tab-item-actions';

                // Rename button
                const renameButton = document.createElement('button');
                renameButton.className = 'tab-item-button';
                renameButton.textContent = 'Rename';
                renameButton.onclick = () => {
                    const newName = prompt('Enter new tab name:', tabName);
                    if (newName && newName !== tabName) {
                        // Update tab name in the list
                        const index = tabsData.tabs.indexOf(tabName);
                        if (index !== -1) {
                            tabsData.tabs[index] = newName;
                        }

                        // Update tab name in images
                        Object.keys(tabsData.image_tabs).forEach(filename => {
                            const tabIndex = tabsData.image_tabs[filename].indexOf(tabName);
                            if (tabIndex !== -1) {
                                tabsData.image_tabs[filename][tabIndex] = newName;
                            }
                        });

                        // Update UI
                        saveTabsData().then(() => {
                            showTabsEditModal(container);
                        });
                    }
                };
                tabActions.appendChild(renameButton);

                // Delete button
                const deleteButton = document.createElement('button');
                deleteButton.className = 'tab-item-button delete';
                deleteButton.textContent = 'Delete';
                deleteButton.onclick = () => {
                    if (confirm(`Are you sure you want to delete the tab "${tabName}"?`)) {
                        // Remove tab from the list
                        const index = tabsData.tabs.indexOf(tabName);
                        if (index !== -1) {
                            tabsData.tabs.splice(index, 1);
                        }

                        // Remove tab from images
                        Object.keys(tabsData.image_tabs).forEach(filename => {
                            const tabIndex = tabsData.image_tabs[filename].indexOf(tabName);
                            if (tabIndex !== -1) {
                                tabsData.image_tabs[filename].splice(tabIndex, 1);
                                if (tabsData.image_tabs[filename].length === 0) {
                                    delete tabsData.image_tabs[filename];
                                }
                            }
                        });

                        // Update UI
                        saveTabsData().then(() => {
                            showTabsEditModal(container);
                        });
                    }
                };
                tabActions.appendChild(deleteButton);

                tabItem.appendChild(tabActions);
                tabsList.appendChild(tabItem);
            });

            modal.appendChild(tabsList);

            // Form for adding a new tab
            const newTabForm = document.createElement('div');
            newTabForm.className = 'new-tab-form';

            const newTabInput = document.createElement('input');
            newTabInput.className = 'new-tab-input';
            newTabInput.placeholder = 'New tab name';
            newTabForm.appendChild(newTabInput);

            const addTabButton = document.createElement('button');
            addTabButton.className = 'new-tab-button';
            addTabButton.textContent = 'Add';
            addTabButton.onclick = () => {
                const tabName = newTabInput.value.trim();
                if (tabName && !tabsData.tabs.includes(tabName)) {
                    tabsData.tabs.push(tabName);
                    saveTabsData().then(() => {
                        showTabsEditModal(container);
                    });
                } else if (tabsData.tabs.includes(tabName)) {
                    alert('A tab with this name already exists!');
                }
            };
            newTabForm.appendChild(addTabButton);

            modal.appendChild(newTabForm);

            // Buttons at the bottom of the modal
            const modalButtons = document.createElement('div');
            modalButtons.className = 'modal-buttons';

            const closeButton = document.createElement('button');
            closeButton.className = 'modal-button primary';
            closeButton.textContent = 'Close';
            closeButton.onclick = () => {
                modal.remove();
                backdrop.remove();
            };
            modalButtons.appendChild(closeButton);

            modal.appendChild(modalButtons);

            container.appendChild(modal);
        }

        // Function to display the tab menu for an image
        function showTabMenu(event, filename, menuContainer) {
            event.stopPropagation();

            // Remove existing menu if it exists
            const existingMenu = document.querySelector('.tab-menu');
            if (existingMenu) {
                existingMenu.remove();
            }

            // Create menu
            const menu = document.createElement('div');
            menu.className = 'tab-menu';
            const ctxRect = menuContainer.getBoundingClientRect();

            const offsetX = event.clientX - ctxRect.left + menuContainer.scrollLeft;
            const offsetY = event.clientY - ctxRect.top + menuContainer.scrollTop;

            menu.style.left = `${offsetX}px`;
            menu.style.top = `${offsetY}px`;

            // Add tabs to the menu
            tabsData.tabs.forEach(tabName => {
                const menuItem = document.createElement('div');
                menuItem.className = 'tab-menu-item';
                menuItem.textContent = tabName;

                // Check if the image is in this tab
                if (tabsData.image_tabs[filename] && tabsData.image_tabs[filename].includes(tabName)) {
                    menuItem.classList.add('selected');
                }

                menuItem.onclick = async () => {
                    if (menuItem.classList.contains('selected')) {
                        // Remove image from the tab
                        await removeImageFromTab(filename, tabName);
                        menuItem.classList.remove('selected');
                    } else {
                        // Add image to the tab
                        await addImageToTab(filename, tabName);
                        menuItem.classList.add('selected');
                    }
                    const entry = document.querySelector(`[title="${filename}"]`);
                    const tabBtn = entry?.querySelector('.tab-button');
                    if (tabBtn) {
                        const isAssigned = (tabsData.image_tabs[filename]?.length ?? 0) > 0;
                        tabBtn.classList.toggle('assigned', isAssigned);
                    }
                };

                menu.appendChild(menuItem);
            });

            // Add item for managing tabs
            if (tabsData.tabs.length > 0) {
                const separator = document.createElement('hr');
                separator.style.margin = '5px 0';
                separator.style.border = '0';
                separator.style.borderTop = '1px solid #444';
                menu.appendChild(separator);
            }

            const manageItem = document.createElement('div');
            manageItem.className = 'tab-menu-item';
            manageItem.textContent = 'Manage Tabs...';
            manageItem.onclick = () => {
                menu.remove();
                showTabsEditModal(menuContainer);
            };
            menu.appendChild(manageItem);

            // Add handler to close the menu when clicking outside
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };

            // Delay to avoid immediate closing
            setTimeout(() => {
                document.addEventListener('click', closeMenu);
            }, 100);

            menuContainer.appendChild(menu);
        }

        LiteGraph.ContextMenu = function (values, options) {
            const ctx = ctxMenu.call(this, values, options);
            if (options?.className === "dark" && values?.length > 0) {
                const items = Array.from(ctx.root.querySelectorAll(".litemenu-entry"));
                let displayedItems = [...items];
                let activeCustomTab = null;

                function UpdatePosition() {
                    let top = options.event.clientY - 10;
                    const bodyRect = document.body.getBoundingClientRect();
                    const rootRect = ctx.root.getBoundingClientRect();
                    if (bodyRect.height && top > bodyRect.height - rootRect.height - 10) {
                        top = Math.max(0, bodyRect.height - rootRect.height - 10);
                    }
                    ctx.root.style.top = top + "px";
                }

                requestAnimationFrame(() => {
                    const currentNode = LGraphCanvas.active_canvas.current_node;
                    const clickedComboValue = currentNode.widgets?.filter(
                        (w) => w.type === "combo" && w.options.values.length === values.length
                    ).find(
                        (w) => w.options.values.every((v, i) => v === values[i])
                    )?.value;
                    let selectedIndex = clickedComboValue ? values.findIndex((v) => v === clickedComboValue) : 0;
                    if (selectedIndex < 0) {
                        selectedIndex = 0;
                    }
                    const selectedItem = displayedItems[selectedIndex];

                    //Tabs
                    const hasBackslash = values.some(value => value.includes('\\'));

                    if (hasBackslash) {
                        const input = ctx.root.querySelector('input');

                        // Create a data structure for folders and files
                        const structure = { Root: { files: [] } };
                        items.forEach(entry => {
                            const path = entry.getAttribute('data-value');
                            const parts = path.split('\\');
                            let current = structure;
                            if (parts.length === 1) {
                                structure.Root.files.push(entry);
                            } else {
                                for (let i = 0; i < parts.length - 1; i++) {
                                    const folder = parts[i];
                                    if (!current[folder]) current[folder] = { files: [] };
                                    current = current[folder];
                                }
                                current.files.push(entry);
                            }
                        });

                        // Function for creating tabs
                        function createTabs(container, structure) {
                            Object.keys(structure).forEach(key => {
                                if (key === 'files') return;
                                const tab = document.createElement('button');
                                tab.textContent = key;
                                tab.className = 'tab';
                                tab.onclick = () => showGroup(container, key, structure);
                                if (key === 'Root') {
                                    container.prepend(tab);
                                } else {
                                    container.appendChild(tab);
                                }
                            });
                        }

                        // Function to display the contents of a folder
                        function showGroup(container, folder, parent) {
                            // Removing existing subfolder tabs
                            const subtabs = container.querySelectorAll('.subtabs');
                            subtabs.forEach(subtab => subtab.remove());

                            const current = parent[folder];
                            const files = current.files || [];
                            const subfolders = Object.keys(current).filter(key => key !== 'files');

                            // Hide all files and folders
                            items.forEach(entry => entry.style.display = 'none');

                            // Display files in the current folder
                            if (folder === 'Root') {
                                items.forEach(item => {
                                    const itemPath = item.getAttribute('data-value');
                                    if (!itemPath.includes('\\')) {
                                        item.style.display = 'block';
                                    }
                                });
                            } else {
                                files.forEach(file => file.style.display = 'block');
                            }

                            // Display tabs for nested folders
                            if (subfolders.length > 0) {
                                const subtabsContainer = document.createElement('div');
                                subtabsContainer.className = 'subtabs';
                                container.appendChild(subtabsContainer);
                                createTabs(subtabsContainer, current);

                                // Display the contents of nested folders
                                subfolders.forEach(subfolder => {
                                    const subtab = Array.from(subtabsContainer.querySelectorAll('button')).find(tab => tab.textContent === subfolder);
                                    if (subtab) {
                                        subtab.onclick = () => showGroup(subtabsContainer, subfolder, current);
                                    }
                                });
                            }

                            // Remove old tabs
                            container.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
                            const tabs = container.querySelectorAll('button');
                            tabs.forEach(tab => {
                                if (tab.textContent === folder) {
                                    tab.classList.add('active');
                                }
                            });
                        }

                        // Creating a Container for Tabs
                        const tabsContainer = document.createElement('div');
                        tabsContainer.className = 'tabs';
                        input.insertAdjacentElement('afterend', tabsContainer);

                        createTabs(tabsContainer, structure);

                        // Select the active tab
                        const selectedPath = selectedItem.getAttribute('data-value').split('\\');
                        const selectedFolders = selectedPath.slice(0, -1);

                        if (selectedFolders.length === 0) {
                            showGroup(tabsContainer, 'Root', structure);
                        } else {
                            let currentContainer = tabsContainer;
                            let currentParent = structure;

                            selectedFolders.forEach((folder, index) => {
                                showGroup(currentContainer, folder, currentParent);

                                const subtabs = currentContainer.querySelectorAll('.subtabs');
                                currentContainer = subtabs[subtabs.length - 1];
                                currentParent = currentParent[folder];

                                if (index < selectedFolders.length - 1) {
                                    const nextFolder = selectedFolders[index + 1];
                                    const tabs = currentContainer.querySelectorAll('button');
                                    tabs.forEach(tab => {
                                        if (tab.textContent === nextFolder) {
                                            tab.classList.add('active');
                                        }
                                    });
                                }
                            });
                        }

                        UpdatePosition();
                    }

                    //Gallery
                    if (values.length > 0 && currentNode.type.startsWith("LoadImage")) {
                        if (FirstRun) {
                            CleanDB(values);
                        }
						options.scroll_speed = 0.5;
						ctx.root.style.display = 'grid';
						ctx.root.style.gridTemplateColumns = 'repeat(4, 88px)';
						// Preload all thumbnails at once
						loadTabsData().then(() => {
							return preloadThumbnailsBatch(values);
						}).then(() => {
							if (displayedItems.length > 30) {
								UpdatePosition();
							}

							// Add container for custom tabs
							const input = ctx.root.querySelector('input');
							const customTabsContainer = document.createElement('div');
							customTabsContainer.className = 'custom-tabs-container';
							customTabsContainer.style.display = 'flex';
							customTabsContainer.style.alignItems = 'center';
							customTabsContainer.style.marginBottom = '10px';
							customTabsContainer.style.overflowX = 'auto';
							customTabsContainer.style.padding = '5px 0';

							// Add "All" tab
							const allTab = document.createElement('button');
							allTab.className = 'tab custom-tab active';
							allTab.textContent = 'All';
							allTab.onclick = () => {
								customTabsContainer.querySelectorAll('.custom-tab').forEach(tab => tab.classList.remove('active'));
								allTab.classList.add('active');
								activeCustomTab = null;

								// Show all images
								items.forEach(entry => {
									entry.style.display = 'block';
								});
							};
							customTabsContainer.appendChild(allTab);

							// Add custom tabs
							tabsData.tabs.forEach(tabName => {
								const tab = document.createElement('button');
								tab.className = 'tab custom-tab';
								tab.textContent = tabName;
								tab.onclick = () => {
									customTabsContainer.querySelectorAll('.custom-tab').forEach(tab => tab.classList.remove('active'));
									tab.classList.add('active');
									activeCustomTab = tabName;

									// Filter images by tab
									items.forEach((entry, idx) => {
										const filename = values[idx];
										if (tabsData.image_tabs[filename] && tabsData.image_tabs[filename].includes(tabName)) {
											entry.style.display = 'block';
										} else {
											entry.style.display = 'none';
										}
									});
								};
								customTabsContainer.appendChild(tab);
							});

							// Add edit tabs button
							const editButton = document.createElement('button');
							editButton.className = 'tabs-edit-button';
							editButton.textContent = '⚙️';
							editButton.title = 'Manage Tabs';
							editButton.onclick = () => {
								showTabsEditModal(ctx.root);
							};
							customTabsContainer.appendChild(editButton);

							input.insertAdjacentElement('afterend', customTabsContainer);

                        items.forEach(async (entry, index) => {
							const filename = values[index];
							entry.classList.add('image-entry');
							entry.setAttribute('title', filename);

							// Use cached thumbnail or load a new one
							let thumbnailUrl = thumbnailCache.get(filename);
							if (!thumbnailUrl) {
								thumbnailUrl = await getThumbnail(filename);
								if (!thumbnailUrl) {
									//thumbnailUrl = await createThumbnail(filename);
									thumbnailUrl = `/get_thumbnail/${encodeURIComponent(filename)}?t=${Date.now()}`;
								}
							}

							entry.style.backgroundImage = `url('${thumbnailUrl}')`;

                            // Delete button
                            const deleteButton = document.createElement('div');
                            deleteButton.classList.add('delete-button');
                            deleteButton.textContent = '×';
                            deleteButton.setAttribute('title', 'Delete');
                            deleteButton.addEventListener('click', async (e) => {
                                e.stopPropagation();
                                if (await deleteFile(filename)) {
                                    entry.remove();
                                    values.splice(index, 1);
                                }
                            });
                            entry.appendChild(deleteButton);

                            // Add to tab button
                            const tabButton = document.createElement('div');
                            tabButton.classList.add('tab-button');
                            tabButton.textContent = '+';
                            tabButton.setAttribute('title', 'Add to Tab');
                            if (tabsData.image_tabs[filename] && tabsData.image_tabs[filename].length > 0) {
                                tabButton.classList.add('assigned');
                            }

                            tabButton.addEventListener('click', (e) => {
                                showTabMenu(e, filename, ctx.root);
                            });
                            entry.appendChild(tabButton);

                            // If a custom tab is active, hide images not in it
                            if (activeCustomTab && (!tabsData.image_tabs[filename] || !tabsData.image_tabs[filename].includes(activeCustomTab))) {
                                entry.style.display = 'none';
                            }
                               });
						});
					}
                });
            }

            return ctx;
        };

        LiteGraph.ContextMenu.prototype = ctxMenu.prototype;
    },
}

app.registerExtension(ext);