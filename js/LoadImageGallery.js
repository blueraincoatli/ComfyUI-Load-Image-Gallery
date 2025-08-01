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
				grid-column: 1 / -1;
			}
			.tabs {
				grid-column: 1 / -1;
				display: flex;
				flex-wrap: wrap;
				width: auto;
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
		`;
        document.head.append(style);
        // Use a more persistent way to track if cleanup has been done
        let cleanupDone = sessionStorage.getItem('galleryCleanupDone') === 'true';
        
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


        // Clean up stale thumbnails
        function CleanDB(values) {
            // Use sessionStorage to track if cleanup has been done
            if (sessionStorage.getItem('galleryCleanupDone') === 'true') {
                return; // Already done, skip
            }
            
            fetch('/cleanup_stale_thumbnails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ active_files: values }),
            })
            .then(response => {
                if (response.ok) {
                    return response.text();
                } else {
                    throw new Error('Cleanup failed');
                }
            })
            .then(message => {
                console.log(message);
                // Mark cleanup as done
                sessionStorage.setItem('galleryCleanupDone', 'true');
            })
            .catch(error => {
                console.error("Error during thumbnails cleanup:", error);
            });
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

                    return true;
                } else {
                    console.error(`Failed to delete file ${filename}`, response.status, response.statusText);
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
				// Handle output files with prefix
				let thumbnailFilename = filename;
				if (filename.startsWith('[output]/')) {
					thumbnailFilename = filename.substring(9); // Remove "[output]/" prefix
				}
				
				console.log("Fetching thumbnail for:", filename, "using path:", thumbnailFilename);  // Debug info
				
				// Check if thumbnail exists on server
				const response = await fetch(`/get_thumbnail/${encodeURIComponent(thumbnailFilename)}`);
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


        LiteGraph.ContextMenu = function (values, options) {
            const ctx = ctxMenu.call(this, values, options);
            if (options?.className === "dark" && values?.length > 0) {
                const items = Array.from(ctx.root.querySelectorAll(".litemenu-entry"));
                let displayedItems = [...items];

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
					let valuesnames;
					let rgthreeon = false;
					if (
					  typeof values[values.length - 1]?.rgthree_originalValue === 'string' &&
					  values[values.length - 1].rgthree_originalValue.trim() !== ''
					) {
					  valuesnames = values.map(item =>
						typeof item?.rgthree_originalValue === 'string' && item.rgthree_originalValue.trim() !== ''
						  ? item.rgthree_originalValue
						  : 'rgthreefolder'
					  );
					  rgthreeon = true;
					} else {
					  valuesnames = values;
					}
					
					
					//Tabs
					if (!rgthreeon && valuesnames.some(value => value.includes('.'))) {
						const hasBackslash = valuesnames.some(value => value.includes('\\'));
						const hasForwardSlash = valuesnames.some(value => value.includes('/'));

						if (hasBackslash || hasForwardSlash) {
							const input = ctx.root.querySelector('input');
							const separator = hasBackslash ? '\\' : '/';

							// Create a data structure for folders and files
							const structure = { Root: { files: [] } };
							items.forEach(entry => {
								const path = entry.getAttribute('data-value');
								const parts = path.split(separator);
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
										if (!itemPath.includes(separator)) {
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
							const selectedPath = selectedItem.getAttribute('data-value').split(separator);
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
					} else {
						const input = ctx.root.querySelector('input');
						const tabsContainer = document.createElement('div');
						tabsContainer.className = 'tabs';
						input.insertAdjacentElement('afterend', tabsContainer);
					}

                    //Gallery
                    if (valuesnames.length > 0 && (currentNode.type.startsWith("LoadImage") || currentNode.type === "LoadImageOutput")) {
						const isChannelList = currentNode.type === "LoadImageMask" && 
                          valuesnames.some(v => ["alpha", "red", "green", "blue"].includes(v));
                        if (!isChannelList) {
							if (!cleanupDone) {
								CleanDB(valuesnames);
								sessionStorage.setItem('galleryCleanupDone', 'true');
								cleanupDone = true;
							}
							if (displayedItems.length > 30) {
									UpdatePosition();
								}
							options.scroll_speed = 0.5;
							ctx.root.style.display = 'grid';
							ctx.root.style.gridTemplateColumns = 'repeat(auto-fit, minmax(88px, 1fr))';
							ctx.root.style.maxWidth = "880px";
							const tabsContainer = ctx.root.querySelector('.tabs');
							if (tabsContainer) {
								const tabsWidth = Array.from(tabsContainer.children)
									.reduce((width, tab) => width + tab.offsetWidth, 0);
								
								const cellWidth = 88;
								const minCells = 4;
								const maxCells = 10;
								
								const requiredCells = Math.ceil(tabsWidth / cellWidth);
								
								const finalCells = Math.max(minCells, Math.min(requiredCells, maxCells));
								
								ctx.root.style.gridTemplateColumns = `repeat(${finalCells}, ${cellWidth}px)`;
							}
							items.forEach((entry, index) => {
								const filename = valuesnames[index];
								if (filename !== "rgthreefolder") {
								entry.classList.add('image-entry');
								entry.setAttribute('title', filename);
								}
							});
							// Preload all thumbnails at once
							preloadThumbnailsBatch(valuesnames).then(() => {
								
								items.forEach((entry, index) => {
									const filename = valuesnames[index];
									if (filename !== "rgthreefolder") {
									
																		// Use cached thumbnail or load a new one
									let thumbnailUrl = window.thumbnailCache.get(filename);
									if (!thumbnailUrl) {
										// Handle output files with prefix
										let thumbnailFilename = filename;
										if (filename.startsWith('[output]/')) {
											// For output files, we use a special naming convention
											let relPath = filename.substring(9); // Remove "[output]/" prefix
											thumbnailFilename = "OP_" + relPath.replace(/\\/g, "__").replace(/\//g, "__").replace(/ /g, "_");
										} else {
											thumbnailFilename = filename.replace(/\\/g, "__").replace(/\//g, "__").replace(/ /g, "_");
										}
										// Get thumbnail from server instead of using placeholder
										thumbnailUrl = `/get_thumbnail/${encodeURIComponent(thumbnailFilename)}`;
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
											valuesnames.splice(index, 1);
										}
									});
									entry.appendChild(deleteButton);
								}
								});
								
							});
					}
					}
                });
            }

            return ctx;
        };

        LiteGraph.ContextMenu.prototype = ctxMenu.prototype;
    },
}

app.registerExtension(ext);