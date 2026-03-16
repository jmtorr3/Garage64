from django.db import migrations, models

DEFAULT_SLOTS = [
    ('wheels',       'Wheels',       1),
    ('headlights',   'Headlights',   2),
    ('front_bumper', 'Front Bumper', 3),
    ('back_bumper',  'Back Bumper',  4),
    ('skirts',       'Skirts',       5),
    ('exhaust',      'Exhaust',      6),
]


def seed_slots(apps, schema_editor):
    PartSlot = apps.get_model('pack', 'PartSlot')
    for name, display, order in DEFAULT_SLOTS:
        PartSlot.objects.create(name=name, display_name=display, order=order)


class Migration(migrations.Migration):

    dependencies = [
        ('pack', '0002_modelpart_slot'),
    ]

    operations = [
        migrations.CreateModel(
            name='PartSlot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=50, unique=True)),
                ('display_name', models.CharField(max_length=100)),
                ('order', models.PositiveIntegerField(default=0)),
            ],
            options={'ordering': ['order']},
        ),
        migrations.RunPython(seed_slots, migrations.RunPython.noop),
    ]
