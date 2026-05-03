using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace RoomVisualizer
{
    /// <summary>
    /// In-game UI panel that displays available prefabs as clickable buttons and
    /// initiates placement sessions when a button is clicked.
    ///
    /// Implements <see cref="IObjectPalette"/>.
    ///
    /// Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6
    /// </summary>
    public class ObjectPalette : MonoBehaviour, IObjectPalette
    {
        // ── Inspector references ─────────────────────────────────────────────

        /// <summary>
        /// The ScrollRect content transform under which buttons are instantiated.
        /// </summary>
        [SerializeField]
        private Transform _contentContainer;

        /// <summary>
        /// Optional prefab with a Button, Image (thumbnail), and Text (name) component.
        /// If null, buttons are created programmatically.
        /// </summary>
        [SerializeField]
        private GameObject _buttonPrefab;

        /// <summary>
        /// Optional prefab with a Text component used as a category header label.
        /// If null, headers are created programmatically.
        /// </summary>
        [SerializeField]
        private GameObject _categoryHeaderPrefab;

        /// <summary>
        /// Fallback sprite shown when an <see cref="AssetLibraryConfig.AssetLibraryEntry"/>
        /// has no thumbnail assigned (Req 20.1).
        /// </summary>
        [SerializeField]
        private Sprite _placeholderThumbnail;

        /// <summary>
        /// If set, <see cref="Populate"/> is called automatically in <see cref="Start"/>
        /// with this config.
        /// </summary>
        [SerializeField]
        private AssetLibraryConfig _assetLibraryConfig;

        /// <summary>
        /// Reference to the <see cref="ObjectPlacer"/> used to cancel placement on Escape.
        /// </summary>
        [SerializeField]
        private ObjectPlacer _objectPlacer;

        // ── IObjectPalette ───────────────────────────────────────────────────

        /// <inheritdoc/>
        public event Action<string> OnPrefabSelected;

        // ── Internal state ───────────────────────────────────────────────────

        /// <summary>PrefabId of the currently active (highlighted) button, or null.</summary>
        private string _activePrefabId;

        /// <summary>Maps PrefabId → the instantiated button GameObject.</summary>
        private readonly Dictionary<string, GameObject> _buttonMap =
            new Dictionary<string, GameObject>(StringComparer.Ordinal);

        // ColorBlock used for the active (highlighted) button.
        private static readonly ColorBlock ActiveColors = new ColorBlock
        {
            normalColor      = new Color(0.3f, 0.7f, 1f, 1f),
            highlightedColor = new Color(0.4f, 0.8f, 1f, 1f),
            pressedColor     = new Color(0.2f, 0.6f, 0.9f, 1f),
            selectedColor    = new Color(0.3f, 0.7f, 1f, 1f),
            disabledColor    = new Color(0.3f, 0.7f, 1f, 0.5f),
            colorMultiplier  = 1f,
            fadeDuration     = 0.1f
        };

        // ── Unity lifecycle ──────────────────────────────────────────────────

        private void Start()
        {
            if (_assetLibraryConfig != null)
                Populate(_assetLibraryConfig);
        }

        private void Update()
        {
            // Req 20.6: Escape key cancels active placement session.
            if (_activePrefabId != null && Input.GetKeyDown(KeyCode.Escape))
            {
                CancelPlacement();
                ClearActiveEntry();
            }
        }

        // ── IObjectPalette implementation ────────────────────────────────────

        /// <summary>
        /// Populates the palette with one button per <see cref="AssetLibraryConfig.AssetLibraryEntry"/>,
        /// grouped under category header labels (Req 20.1, 20.3, 20.4).
        /// </summary>
        public void Populate(AssetLibraryConfig config)
        {
            if (config == null)
            {
                Debug.LogWarning("[ObjectPalette] Populate called with a null AssetLibraryConfig.");
                return;
            }

            // Ensure we have a content container to parent buttons under.
            if (_contentContainer == null)
            {
                Debug.LogWarning(
                    "[ObjectPalette] _contentContainer is not assigned. " +
                    "Buttons will be parented to this GameObject's transform.");
                _contentContainer = transform;
            }

            // Clear any previously created buttons.
            ClearButtons();

            // Group entries by category (preserving insertion order).
            var categories = new Dictionary<string, List<AssetLibraryConfig.AssetLibraryEntry>>(
                StringComparer.Ordinal);
            var categoryOrder = new List<string>();

            foreach (var entry in config.Entries)
            {
                if (entry == null) continue;

                string cat = string.IsNullOrEmpty(entry.Category) ? "Uncategorised" : entry.Category;

                if (!categories.ContainsKey(cat))
                {
                    categories[cat] = new List<AssetLibraryConfig.AssetLibraryEntry>();
                    categoryOrder.Add(cat);
                }

                categories[cat].Add(entry);
            }

            // Instantiate header + buttons for each category.
            foreach (string cat in categoryOrder)
            {
                // Category header label.
                CreateCategoryHeader(cat);

                foreach (var entry in categories[cat])
                {
                    if (string.IsNullOrEmpty(entry.PrefabId))
                        continue;

                    GameObject buttonGO = CreateButton(entry);
                    buttonGO.transform.SetParent(_contentContainer, false);
                    _buttonMap[entry.PrefabId] = buttonGO;
                }
            }
        }

        /// <summary>
        /// Highlights the button for <paramref name="prefabId"/> and deselects all others
        /// (Req 20.5).
        /// </summary>
        public void SetActiveEntry(string prefabId)
        {
            // Deselect the previously active button.
            if (_activePrefabId != null && _buttonMap.TryGetValue(_activePrefabId, out var prev))
                SetButtonHighlight(prev, false);

            _activePrefabId = prefabId;

            if (prefabId != null && _buttonMap.TryGetValue(prefabId, out var next))
                SetButtonHighlight(next, true);
        }

        /// <summary>
        /// Deselects the active button (Req 20.6).
        /// </summary>
        public void ClearActiveEntry()
        {
            SetActiveEntry(null);
        }

        // ── Private helpers ──────────────────────────────────────────────────

        /// <summary>
        /// Creates a button for <paramref name="entry"/>, either from <see cref="_buttonPrefab"/>
        /// or programmatically.
        /// </summary>
        private GameObject CreateButton(AssetLibraryConfig.AssetLibraryEntry entry)
        {
            GameObject go;

            if (_buttonPrefab != null)
            {
                go = Instantiate(_buttonPrefab);
                go.name = entry.PrefabId;

                // Set thumbnail image.
                Image img = go.GetComponentInChildren<Image>();
                if (img != null)
                {
                    if (entry.Thumbnail != null)
                        img.sprite = entry.Thumbnail;
                    else if (_placeholderThumbnail != null)
                        img.sprite = _placeholderThumbnail;
                    // If neither is available, leave the default sprite — no throw (Req 20.1).
                }

                // Set display name label.
                Text label = go.GetComponentInChildren<Text>();
                if (label != null)
                    label.text = entry.DisplayName ?? entry.PrefabId;
            }
            else
            {
                go = CreateButtonProgrammatic(entry);
            }

            // Wire up the click handler.
            Button btn = go.GetComponent<Button>();
            if (btn == null)
                btn = go.AddComponent<Button>();

            // Capture PrefabId in a local variable for the closure.
            string prefabId = entry.PrefabId;
            btn.onClick.AddListener(() => OnButtonClicked(prefabId));

            return go;
        }

        /// <summary>
        /// Creates a simple button programmatically when no <see cref="_buttonPrefab"/> is assigned.
        /// </summary>
        private GameObject CreateButtonProgrammatic(AssetLibraryConfig.AssetLibraryEntry entry)
        {
            var go = new GameObject(entry.PrefabId, typeof(RectTransform));
            var btn = go.AddComponent<Button>();
            var img = go.AddComponent<Image>();
            img.color = Color.white;

            // Thumbnail.
            if (entry.Thumbnail != null)
                img.sprite = entry.Thumbnail;
            else if (_placeholderThumbnail != null)
                img.sprite = _placeholderThumbnail;
            // No throw when thumbnail is missing (Req 20.1).

            // Label.
            var labelGO = new GameObject("Label", typeof(RectTransform));
            labelGO.transform.SetParent(go.transform, false);
            var text = labelGO.AddComponent<Text>();
            text.text = entry.DisplayName ?? entry.PrefabId;
            text.fontSize = 12;
            text.color = Color.black;
            text.alignment = TextAnchor.MiddleCenter;

            return go;
        }

        /// <summary>
        /// Creates a category header label, either from <see cref="_categoryHeaderPrefab"/>
        /// or programmatically.
        /// </summary>
        private void CreateCategoryHeader(string categoryName)
        {
            GameObject headerGO;

            if (_categoryHeaderPrefab != null)
            {
                headerGO = Instantiate(_categoryHeaderPrefab);
                headerGO.name = $"Header_{categoryName}";

                Text label = headerGO.GetComponentInChildren<Text>();
                if (label != null)
                    label.text = categoryName;
            }
            else
            {
                headerGO = new GameObject($"Header_{categoryName}", typeof(RectTransform));
                var text = headerGO.AddComponent<Text>();
                text.text = categoryName;
                text.fontSize = 14;
                text.fontStyle = FontStyle.Bold;
                text.color = Color.white;
                text.alignment = TextAnchor.MiddleLeft;
            }

            headerGO.transform.SetParent(_contentContainer, false);
        }

        /// <summary>
        /// Applies or removes the active highlight <see cref="ColorBlock"/> on a button.
        /// </summary>
        private static void SetButtonHighlight(GameObject buttonGO, bool active)
        {
            Button btn = buttonGO.GetComponent<Button>();
            if (btn == null)
                return;

            if (active)
            {
                btn.colors = ActiveColors;
            }
            else
            {
                btn.colors = ColorBlock.defaultColorBlock;
            }
        }

        /// <summary>
        /// Handles a button click: fires <see cref="OnPrefabSelected"/> and highlights the button.
        /// </summary>
        private void OnButtonClicked(string prefabId)
        {
            SetActiveEntry(prefabId);
            OnPrefabSelected?.Invoke(prefabId);
        }

        /// <summary>
        /// Cancels the active placement session via <see cref="ObjectPlacer.CancelPlacement"/>.
        /// </summary>
        private void CancelPlacement()
        {
            if (_objectPlacer != null)
                _objectPlacer.CancelPlacement();
        }

        /// <summary>
        /// Destroys all instantiated button and header GameObjects and clears the button map.
        /// </summary>
        private void ClearButtons()
        {
            foreach (var go in _buttonMap.Values)
            {
                if (go != null)
                    Destroy(go);
            }

            _buttonMap.Clear();
            _activePrefabId = null;

            // Also destroy any header GameObjects that were parented to the container.
            if (_contentContainer != null)
            {
                for (int i = _contentContainer.childCount - 1; i >= 0; i--)
                {
                    Destroy(_contentContainer.GetChild(i).gameObject);
                }
            }
        }
    }
}
